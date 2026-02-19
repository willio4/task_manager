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
let isLoggedIn = false;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

const db = new pg.Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  database: process.env.PG_DB,
  password: process.env.PG_PW,
  port: process.env.PG_PORT,
});

db.connect();

app.get("/", (req, res) => {
  let year = new Date().getFullYear();
  res.render("landing.ejs", {
    year,
    currentUser: req.user,
  });
});

app.get("/login", (req, res) => {
  let year = new Date().getFullYear();
  res.render("login.ejs", {
    year: year,
  });
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  }),
);

app.get("/signup", (req, res) => {
  let year = new Date().getFullYear();
  res.render("signup.ejs", {
    year,
    
  });
});

app.post("/signup", async (req, res, next) => {
  const { email, password } = req.body;

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
    res.redirect("/");
  });
});

passport.use(
  new Strategy(
    { usernameField: "email", passwordField: "password" },
    async function verify(email, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) return cb(null, false);

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (valid) return cb(null, user);
        return cb(null, false);
      } catch (err) {
        return cb(err);
      }
    }
  )
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
