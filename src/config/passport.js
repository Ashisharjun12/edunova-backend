import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { _config } from './config.js';
import { db } from './database.js';
import { users } from '../models/user.model.js';
import { eq, or } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [foundUser] = await db.select().from(users).where(eq(users.id, id));
    console.log('Deserializing user:', foundUser);
    done(null, foundUser);
  } catch (error) {
    console.error('Deserialize error:', error);
    done(error, null);
  }
});

// Helper function to generate access token
const generateAccessToken = (user) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, type: 'access' },
    _config.JWT_SECRET || 'your-jwt-secret',
    { expiresIn: '15m' } // Short-lived access token
  );
  console.log('Generated access token for user:', { userId: user.id, token });
  return token;
};

// Helper function to generate refresh token
const generateRefreshToken = (user) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, type: 'refresh' },
    _config.JWT_REFRESH_SECRET || _config.JWT_SECRET || 'your-refresh-secret',
    { expiresIn: '7d' } // Long-lived refresh token
  );
  console.log('Generated refresh token for user:', { userId: user.id, token });
  return token;
};

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: _config.GOOGLE_CLIENT_ID,
    clientSecret: _config.GOOGLE_CLIENT_SECRET,
    callbackURL: `${_config.BACKEND_URL}/api/v1/auth/google/callback`,
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('=== Google OAuth Response ===');
      console.log('Access Token:', accessToken);
      console.log('Refresh Token:', refreshToken);
      console.log('Profile:', {
        id: profile.id,
        displayName: profile.displayName,
        emails: profile.emails,
        photos: profile.photos,
        provider: profile.provider,
        refreshToken: refreshToken
      });

      // Check if user exists
      const [existingUser] = await db.select().from(users).where(
        or(eq(users.email, profile.emails[0].value), eq(users.googleId, profile.id))
      );

      if (existingUser) {
        console.log('Existing user found:', existingUser);
        // Update googleId if not set
        if (!existingUser.googleId) {
          const updatedUser = await db.update(users)
            .set({ 
              googleId: profile.id,
              avatar: profile.photos[0]?.value || existingUser.avatar,
              name: profile.displayName || existingUser.name
            })
            .where(eq(users.id, existingUser.id))
            .returning();
          console.log('Updated existing user:', updatedUser);
        }
        // Add tokens to user object
        existingUser.accessToken = generateAccessToken(existingUser);
        existingUser.refreshToken = generateRefreshToken(existingUser);
        existingUser.token = existingUser.accessToken; // For backward compatibility
        console.log('Returning existing user with tokens:', existingUser);
        return done(null, existingUser);
      }

      // Create new user
      const [newUser] = await db.insert(users).values({
        name: profile.displayName,
        email: profile.emails[0].value,
        googleId: profile.id,
        avatar: profile.photos[0]?.value || null
      }).returning();

      console.log('Created new user:', newUser);

      // Add tokens to user object
      newUser.accessToken = generateAccessToken(newUser);
      newUser.refreshToken = generateRefreshToken(newUser);
      newUser.token = newUser.accessToken; // For backward compatibility
      console.log('Returning new user with tokens:', newUser);
      return done(null, newUser);
    } catch (error) {
      console.error('Google Strategy Error:', error);
      return done(error, null);
    }
  }
));

export default passport;