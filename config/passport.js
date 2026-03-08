import passport from "passport";
import { Strategy } from "passport-local";
import bcrypt from "bcrypt";
import { db } from "./db.js";

passport.use(
  new Strategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, cb) => {
      try {
        const result = await db.query(
          `SELECT * FROM users WHERE email = $1`,
          [email]
        );

        if (!result.rows.length) return cb(null, false);

        const user = result.rows[0];

        const valid = await bcrypt.compare(password, user.password);

        if (!valid) return cb(null, false);

        return cb(null, user);
      } catch (err) {
        cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => cb(null, user.id));

passport.deserializeUser(async (id, cb) => {
  const result = await db.query(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );
  cb(null, result.rows[0]);
});

export default passport;