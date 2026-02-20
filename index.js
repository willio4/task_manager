import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import env from "dotenv";
import bodyParser from "body-parser";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
env.config();

const app = express();
const port = process.env.PORT;
const year = new Date().getFullYear();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
import path from "path";

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

const db = new pg.Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  database: process.env.PG_DB,
  password: process.env.PG_PW,
  port: process.env.PG_PORT,
});

db.connect();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use(async (req, res, next) => {
  if (req.user) {
    try {
      const result = await db.query(
        "SELECT * FROM profiles WHERE user_id = $1",
        [req.user.id],
      );
      res.locals.currentProfile = result.rows[0];
      res.locals.currentUser = req.user;
    } catch (err) {
      console.error(err);
      res.locals.currentProfile = null;
      res.locals.currentUser = null;
    }
  } else {
    res.locals.currentProfile = null;
    res.locals.currentUser = null;
  }
  next();
});

app.get("/", (req, res) => {
  res.render("landing.ejs", {
    year,
  });
});

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

app.get("/profile", ensureLoggedIn, (req, res) => {
  const year = new Date().getFullYear();
  res.render("profile", { year });
});

app.get("/login", (req, res) => {
  res.render("login.ejs", {
    year: year,
  });
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect("/login");

    req.logIn(user, async (err) => {
      if (err) return next(err);

      let result = await db.query("SELECT * FROM profiles WHERE user_id = $1", [
        req.user.id,
      ]);

      if (result.rows.length > 0) {
        const profile = result.rows[0];
        return res.redirect("/");
      } else {
        return res.redirect("/createAccount");
      }
    });
  })(req, res, next);
});

app.get("/createAccount", (req, res) => {
  res.render("createAccount.ejs", {
    year,
    currentUser: req.user,
  });
});

app.post("/createAccount", async (req, res) => {
  const { fName, lName, email, role } = req.body;
  const result = await db.query(
    "INSERT INTO profiles(user_id, first_name, last_name, role) VALUES($1,$2,$3,$4) RETURNING *",
    [req.user.id, fName, lName, role],
  );

  res.redirect("/");
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs", {
    year,
  });
});

app.get("/admin", ensureLoggedIn, async (req, res) => {
  res.render("admin.ejs", { year });
});

app.post("/admin", ensureLoggedIn, async (req, res) => {
  const { orgName } = req.body;
  const result = await db.query(
    "INSERT INTO organizations(org_name, owner_id) VALUES($1, $2) RETURNING *",
    [orgName, req.user.id],
  );

  await db.query("update profiles set organization_id = $1 where user_id = $2", [
    result.rows[0].id,
    req.user.id,
  ]);
  
  res.redirect("/admin");
});

app.post("/signup", async (req, res, next) => {
  const { email, password, confirmed_password } = req.body;

  if (password !== confirmed_password) {
    return res.send("Passwords do not match.");
  }

  const results = await db.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);

  if (results.rows.length > 0) {
    return res.send("Account already exists.");
  }

  const hash = await bcrypt.hash(password, 10);

  const result = await db.query(
    "INSERT INTO users(email, password) VALUES($1, $2) RETURNING *",
    [email, hash],
  );

  req.login(result.rows[0], (err) => {
    if (err) return next(err);
    res.redirect("/createAccount");
  });
});

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

passport.use(
  new Strategy(
    { usernameField: "email", passwordField: "password" },
    async function verify(email, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          email,
        ]);
        if (result.rows.length === 0) return cb(null, false);

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (valid) return cb(null, user);
        return cb(null, false);
      } catch (err) {
        return cb(err);
      }
    },
  ),
);

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser(async (id, cb) => {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  cb(null, result.rows[0]);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
