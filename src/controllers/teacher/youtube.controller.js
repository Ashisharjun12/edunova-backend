import { db } from '../../config/database.js';
import { users } from '../../models/user.model.js';
import { eq } from 'drizzle-orm';
import logger from '../../utils/logger.js';
import { _config } from '../../config/config.js';
import axios from 'axios';

// YouTube OAuth Scopes
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];

// Generate YouTube OAuth URL
export const initiateYouTubeConnection = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Generate a random state parameter for CSRF protection
    const state = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    // Store state in session or database for verification
    // For now, we'll include userId in state and verify it matches
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${_config.YOUTUBE_CLIENT_ID}&` +
      `redirect_uri=${_config.BACKEND_URL}/api/v1/teacher/youtube/callback&` +
      `scope=${YOUTUBE_SCOPES.join(' ')}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `include_granted_scopes=true&` +
      `prompt=consent&` +
      `state=${state}`;

    logger.info(`YouTube OAuth initiated for user: ${userId}, state: ${state}`);
    
    res.json({
      success: true,
      authUrl,
      state,
      message: 'YouTube OAuth URL generated successfully'
    });
  } catch (error) {
    logger.error('YouTube OAuth initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate YouTube connection'
    });
  }
};

// Handle YouTube OAuth callback
export const handleYouTubeCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Handle error response from Google OAuth
    if (error) {
      logger.error('OAuth error from Google:', error);
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=${error}`);
    }
    
    // Check if authorization code is present
    if (!code) {
      logger.error('No authorization code received from Google');
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=no_code`);
    }
    
    // Verify state parameter for CSRF protection
    if (!state) {
      logger.error('No state parameter received - possible CSRF attack');
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=invalid_state`);
    }
    
    // Extract userId from state (format: userId_timestamp_random)
    const stateParts = state.split('_');
    if (stateParts.length < 3) {
      logger.error('Invalid state format - possible CSRF attack');
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=invalid_state`);
    }
    
    const userId = stateParts[0];
    
    // Verify user exists
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) {
      logger.error('User not found for state:', state);
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=user_not_found`);
    }

    logger.info(`Processing OAuth callback for user: ${userId}, code: ${code.substring(0, 10)}...`);

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: _config.YOUTUBE_CLIENT_ID,
      client_secret: _config.YOUTUBE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${_config.BACKEND_URL}/api/v1/teacher/youtube/callback`
    });

    const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
    
    logger.info(`Token exchange successful for user: ${userId}, scopes granted: ${scope}`);
    
    // Get channel information using the access token
    const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'snippet,statistics',
        mine: true,
        access_token: access_token
      }
    });

    const channel = channelResponse.data.items[0];
    
    if (!channel) {
      logger.error('No YouTube channel found for user');
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=no_channel`);
    }

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + (expires_in * 1000));

    // Update user with YouTube information
    await db.update(users)
      .set({
        youtubeChannelId: channel.id,
        youtubeChannelTitle: channel.snippet.title,
        youtubeAccessToken: access_token,
        youtubeRefreshToken: refresh_token,
        youtubeTokenExpiry: tokenExpiry,
        youtubeConnectedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    logger.info(`YouTube account connected successfully for user: ${userId}, channel: ${channel.snippet.title}`);
    
    res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_success=connected`);
  } catch (error) {
    logger.error('YouTube callback error:', error);
    
    // Handle specific OAuth errors
    if (error.response?.data?.error === 'invalid_grant') {
      logger.error('Invalid authorization code - user may need to restart OAuth process');
      return res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=invalid_grant`);
    }
    
    res.redirect(`${_config.FRONTEND_URL}/teacher/settings?youtube_error=connection_failed`);
  }
};

// Get YouTube connection status
export const getYouTubeStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [user] = await db.select({
      youtubeChannelId: users.youtubeChannelId,
      youtubeChannelTitle: users.youtubeChannelTitle,
      youtubeConnectedAt: users.youtubeConnectedAt,
      youtubeTokenExpiry: users.youtubeTokenExpiry
    }).from(users).where(eq(users.id, userId));

    const isConnected = !!user.youtubeChannelId;
    const isTokenValid = user.youtubeTokenExpiry ? new Date() < new Date(user.youtubeTokenExpiry) : false;

    res.json({
      success: true,
      connected: isConnected,
      tokenValid: isTokenValid,
      channelId: user.youtubeChannelId,
      channelTitle: user.youtubeChannelTitle,
      connectedAt: user.youtubeConnectedAt
    });
  } catch (error) {
    logger.error('Get YouTube status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get YouTube connection status'
    });
  }
};

// Refresh YouTube access token
export const refreshYouTubeToken = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [user] = await db.select({
      youtubeRefreshToken: users.youtubeRefreshToken,
      youtubeChannelId: users.youtubeChannelId
    }).from(users).where(eq(users.id, userId));

    if (!user.youtubeRefreshToken) {
      return res.status(400).json({
        success: false,
        message: 'No refresh token available'
      });
    }

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: _config.YOUTUBE_CLIENT_ID,
      client_secret: _config.YOUTUBE_CLIENT_SECRET,
      refresh_token: user.youtubeRefreshToken,
      grant_type: 'refresh_token'
    });

    const { access_token, expires_in } = tokenResponse.data;
    const tokenExpiry = new Date(Date.now() + (expires_in * 1000));

    await db.update(users)
      .set({
        youtubeAccessToken: access_token,
        youtubeTokenExpiry: tokenExpiry,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    logger.info(`YouTube token refreshed for user: ${userId}`);
    
    res.json({
      success: true,
      message: 'YouTube token refreshed successfully'
    });
  } catch (error) {
    logger.error('YouTube token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh YouTube token'
    });
  }
};

// Disconnect YouTube account
export const disconnectYouTube = async (req, res) => {
  try {
    const userId = req.user.id;
    
    await db.update(users)
      .set({
        youtubeChannelId: null,
        youtubeChannelTitle: null,
        youtubeAccessToken: null,
        youtubeRefreshToken: null,
        youtubeTokenExpiry: null,
        youtubeConnectedAt: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    logger.info(`YouTube account disconnected for user: ${userId}`);
    
    res.json({
      success: true,
      message: 'YouTube account disconnected successfully'
    });
  } catch (error) {
    logger.error('YouTube disconnect error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect YouTube account'
    });
  }
};

// Get YouTube videos
export const getYouTubeVideos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { pageToken, maxResults = 10 } = req.query;
    
    const [user] = await db.select({
      youtubeAccessToken: users.youtubeAccessToken,
      youtubeChannelId: users.youtubeChannelId,
      youtubeTokenExpiry: users.youtubeTokenExpiry
    }).from(users).where(eq(users.id, userId));

    if (!user.youtubeAccessToken || !user.youtubeChannelId) {
      return res.status(400).json({
        success: false,
        message: 'YouTube account not connected'
      });
    }

    // Check if token needs refresh
    const isTokenExpired = user.youtubeTokenExpiry ? new Date() > new Date(user.youtubeTokenExpiry) : false;
    
    let accessToken = user.youtubeAccessToken;
    
    if (isTokenExpired) {
      // Refresh token logic would go here
      return res.status(401).json({
        success: false,
        message: 'YouTube token expired. Please reconnect your account.'
      });
    }

    // Fetch videos from YouTube API
    const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        channelId: user.youtubeChannelId,
        type: 'video',
        order: 'date',
        maxResults: parseInt(maxResults),
        pageToken: pageToken || undefined,
        access_token: accessToken
      }
    });

    const videos = videosResponse.data.items.map(video => ({
      id: video.id.videoId,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
      publishedAt: video.snippet.publishedAt,
      channelTitle: video.snippet.channelTitle
    }));

    res.json({
      success: true,
      videos,
      nextPageToken: videosResponse.data.nextPageToken,
      totalResults: videosResponse.data.pageInfo.totalResults
    });
  } catch (error) {
    logger.error('Get YouTube videos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch YouTube videos'
    });
  }
};

// Get specific YouTube video details (works with or without YouTube connection)
export const getYouTubeVideoDetails = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;
    
    // Try to get user's YouTube access token (optional - for better data)
    let accessToken = null;
    try {
      const [user] = await db.select({
        youtubeAccessToken: users.youtubeAccessToken,
        youtubeTokenExpiry: users.youtubeTokenExpiry
      }).from(users).where(eq(users.id, userId));

      if (user?.youtubeAccessToken) {
        const isTokenExpired = user.youtubeTokenExpiry ? new Date() > new Date(user.youtubeTokenExpiry) : false;
        if (!isTokenExpired) {
          accessToken = user.youtubeAccessToken;
        }
      }
    } catch (dbError) {
      logger.warn('Could not fetch user YouTube token:', dbError);
    }

    // Try YouTube Data API v3 first (if token available)
    if (accessToken) {
      try {
        const videoResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            part: 'snippet,contentDetails,statistics',
            id: videoId,
            access_token: accessToken
          }
        });

        if (videoResponse.data.items && videoResponse.data.items.length > 0) {
          const video = videoResponse.data.items[0];
          return res.json({
            success: true,
            video: {
              id: video.id,
              title: video.snippet.title,
              description: video.snippet.description,
              thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
              duration: video.contentDetails.duration,
              publishedAt: video.snippet.publishedAt,
              viewCount: video.statistics?.viewCount || '0',
              likeCount: video.statistics?.likeCount || '0',
              channelTitle: video.snippet.channelTitle
            }
          });
        }
      } catch (apiError) {
        logger.warn('YouTube API v3 failed, trying fallback:', apiError.message);
      }
    }

    // Fallback: Use oEmbed API (no auth needed, works for public videos)
    try {
      const oembedResponse = await axios.get('https://www.youtube.com/oembed', {
        params: {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          format: 'json'
        },
        timeout: 10000
      });

      // oEmbed doesn't provide duration, so we'll fetch it from video page
      let duration = null;
      try {
        const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const pageResponse = await axios.get(videoPageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        });
        
        const pageHtml = pageResponse.data;
        const durationMatch = pageHtml.match(/"lengthSeconds":"(\d+)"/);
        if (durationMatch) {
          const seconds = parseInt(durationMatch[1]);
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = seconds % 60;
          duration = `PT${hours > 0 ? hours + 'H' : ''}${minutes}M${secs}S`;
        }
      } catch (durationError) {
        logger.warn('Could not fetch duration:', durationError.message);
      }

      return res.json({
        success: true,
        video: {
          id: videoId,
          title: oembedResponse.data.title,
          description: '',
          thumbnail: oembedResponse.data.thumbnail_url,
          duration: duration,
          publishedAt: new Date().toISOString(),
          viewCount: '0',
          likeCount: '0',
          channelTitle: oembedResponse.data.author_name
        }
      });
    } catch (oembedError) {
      logger.error('oEmbed API failed:', oembedError);
      throw new Error('Failed to fetch video details. Please check if the video ID is correct and the video is public.');
    }
  } catch (error) {
    logger.error('Get YouTube video details error:', error);
    res.status(500).json({
      success: false,
      message: error.response?.data?.error?.message || error.message || 'Failed to fetch video details'
    });
  }
};
