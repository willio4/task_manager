import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import env from "dotenv";
import bodyParser from "body-parser";
env.config();

const app = express();
const port = process.env.PORT;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  let year = new Date().getFullYear();
  res.render("landing.ejs", {
    year: year,
  });
});

app.get("/login", (req, res) => {
    let year = new Date().getFullYear();
    res.render("login.ejs", {
        year: year,
    });
})

app.get("/signup", (req, res) => {
    let year = new Date().getFullYear();
    res.render("signup.ejs", {
        year: year,
    });
})
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
