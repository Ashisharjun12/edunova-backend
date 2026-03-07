
import createHttpError from "http-errors";

export const customrole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        createHttpError(403, `Only ${roles.join(", ")} Can Access This Resource`),
        res.status(403).json({
          success: false,
          message: `Only ${roles.join(", ")} Can Access This Resource`
        })
      );
    }
    next();
  };
};

