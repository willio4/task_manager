import express from "express";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import path from "path";
import { db } from "./config/db.js";

const app = express();
const port = process.env.PORT || 3000;
const year = new Date().getFullYear();
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(async (req, res, next) => {
  if (req.user) {
    try {
      const result = await db.query(
        `SELECT * 
        FROM profiles
        INNER JOIN organizations ON profiles.organization_id = organizations.id
        WHERE user_id = $1`,
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

function ensureLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

function ensureAdmin(req, res, next) {
  if (
    res.locals.currentProfile &&
    (res.locals.currentProfile.role === "Admin" ||
      res.locals.currentProfile.role === "Manager")
  ) {
    return next();
  } else {
    return res.send("You are not authorized to view this page.");
  }
}

app.get("/", ensureLoggedIn, async (req, res) => {
  const countsResult = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count,
      COUNT(*) FILTER (WHERE status = 'Incomplete') AS incomplete_count,
      COUNT(*) FILTER (WHERE status = 'Stuck') AS stuck_count
    FROM tasks
    WHERE organization_id = $1;`,
    [res.locals.currentProfile.organization_id],
  );

  const row = countsResult.rows[0];
  const completed = Number(row.completed_count);
  const incomplete = Number(row.incomplete_count);
  const stuck = Number(row.stuck_count);

  const total = completed + incomplete + stuck;

  const userTasksResult = await db.query(
    `SELECT title, first_name, status, due_date
     FROM tasks
     INNER JOIN profiles ON tasks.created_by = profiles.user_id
     WHERE created_for = $1
     ORDER BY due_date ASC;`,
    [req.user.id],
  );

  const stuckTasksResult = await db.query(
    `SELECT title, status, first_name, priority, due_date
     FROM tasks
     inner join profiles on tasks.created_by = profiles.user_id
     WHERE tasks.organization_id = $1
       AND status = 'Stuck'
     ORDER BY priority DESC;`,
    [res.locals.currentProfile.organization_id],
  );

  const depTasksResult = await db.query(
    `SELECT 
    p.user_id,
    p.first_name,
    COUNT(t.id) AS total_tasks,
    COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed_tasks,
    COALESCE(SUM(CASE WHEN t.status = 'Stuck' THEN 1 ELSE 0 END), 0) AS stuck_tasks
    FROM profiles p
    LEFT JOIN tasks t ON t.created_for = p.user_id AND t.organization_id = $2
    WHERE p.department = $1
    GROUP BY p.user_id, p.first_name
    ORDER BY p.first_name;`,
    [
      res.locals.currentProfile.department,
      res.locals.currentProfile.organization_id,
    ],
  );

  const depRow = depTasksResult.rows;

  const depData = {
    labels: depRow.map((r) => r.first_name),
    datasets: [
      {
        label: "Completed",
        data: depRow.map((r) => Number(r.completed_tasks)),
        backgroundColor: "#4CAF50",
      },
      {
        label: "Stuck",
        data: depRow.map((r) => r.stuck_tasks),
        backgroundColor: "#ea2d14",
      },
      {
        label: "Remaining",
        data: depRow.map(
          (r) => r.total_tasks - r.completed_tasks - r.stuck_tasks,
        ),
        backgroundColor: "#E0E0E0",
      },
    ],
  };

  const orgData = {
    labels: ["Completed", "Incomplete", "Stuck"],
    datasets: [
      {
        label: "Organization Tasks",
        data: [completed, incomplete, stuck],
        borderWidth: 1,
        backgroundColor: ["#4CAF50", "#FFC107", "#F44336"],
      },
    ],
  };

  res.render("index.ejs", {
    year,
    counts: row,
    total,
    userTasks: userTasksResult.rows,
    stuckTasks: stuckTasksResult.rows,
    orgData,
    depData,
  });
});

app.get("/tasks", ensureLoggedIn, async (req, res) => {
  try {
    const employeesRes = await db.query(
      `SELECT user_id, first_name, last_name
       FROM profiles
       WHERE organization_id = $1
         AND department = $2
         AND user_id != $3`,
      [
        res.locals.currentProfile.organization_id,
        res.locals.currentProfile.department,
        req.user.id,
      ],
    );

    const tasksReceivedRes = await db.query(
      `SELECT
         tasks.id AS task_id,
         tasks.title,
         tasks.status,
         tasks.priority,
         tasks.due_date,
         profiles.first_name
       FROM tasks
       JOIN profiles ON profiles.user_id = tasks.created_for
       WHERE tasks.created_for = $1
       ORDER BY tasks.due_date ASC`,
      [req.user.id],
    );

    const tasksReceived = tasksReceivedRes.rows.map((row) => ({
      id: row.task_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      due_date: row.due_date,
      first_name: row.first_name,
    }));

    const tasksCreatedRes = await db.query(
      `SELECT
         tasks.id AS task_id,
         tasks.title,
         tasks.status,
         tasks.priority,
         tasks.due_date,
         profiles.first_name
       FROM tasks
       JOIN profiles ON profiles.user_id = tasks.created_by
       WHERE tasks.created_by = $1
       ORDER BY tasks.due_date ASC`,
      [req.user.id],
    );

    const tasksCreated = tasksCreatedRes.rows.map((row) => ({
      id: row.task_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      due_date: row.due_date,
      first_name: row.first_name,
    }));

    const today = new Date().toISOString().slice(0, 10);

    res.render("tasks.ejs", {
      year,
      employees: employeesRes.rows,
      tasksReceived,
      tasksCreated,
      today,
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get("/profile", ensureLoggedIn, (req, res) => {
  const year = new Date().getFullYear();
  res.render("profile", { year });
});

app.get("/login", (req, res) => {
  res.render("login.ejs", {
    year,
  });
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect("/login");

    req.logIn(user, async (err) => {
      if (err) return next(err);

      let result = await db.query(
        `SELECT * 
        FROM profiles 
        WHERE user_id = $1`,
        [req.user.id],
      );

      if (result.rows.length > 0) {
        const profile = result.rows[0];
        return res.redirect("/");
      } else {
        return res.redirect("/create-account");
      }
    });
  })(req, res, next);
});
app.get("/activity", ensureLoggedIn, async (req, res) => {
  const orgTasks = await db.query(
    `SELECT title, description, priority, status, due_date, creator.first_name as created_by, worker.first_name as created_for, updated_at
    FROM public.tasks
    left join profiles creator on tasks.created_by = creator.user_id
    left join profiles worker on tasks.created_for = worker.user_id
    where tasks.organization_id = $1
    ORDER BY updated_at DESC;`,
    [res.locals.currentProfile.organization_id],
  );

  res.render("activity.ejs", {
    year,
    orgTasks: orgTasks.rows,
  });
});

app.get("/health", ensureLoggedIn, async (req, res) => {
  const barChart = await db.query(
    `SELECT department, p.user_id, p.first_name, 
            COUNT(t.id) AS total_tasks, 
            COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed_tasks,
            COALESCE(SUM(CASE WHEN t.status = 'Stuck' THEN 1 ELSE 0 END), 0) AS stuck_tasks
     FROM profiles p
     LEFT JOIN tasks t ON p.user_id = t.created_for AND t.organization_id = $1
     WHERE p.organization_id = $1
     GROUP BY p.user_id, p.first_name, department
     ORDER BY department, p.first_name;`,
    [res.locals.currentProfile.organization_id],
  );

  const pieChart = await db.query(
    `SELECT 
    p.department,
    COUNT(t.title) AS total_tasks,
    COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed_tasks,
    COALESCE(SUM(CASE WHEN t.status = 'Stuck' THEN 1 ELSE 0 END), 0) AS stuck_tasks
FROM profiles p
LEFT JOIN tasks t ON p.user_id = t.created_for
WHERE p.organization_id = $1
GROUP BY p.department;`,
    [res.locals.currentProfile.organization_id],
  );

  const groupedBarChart = barChart.rows.reduce((acc, row) => {
    if (!acc[row.department]) acc[row.department] = [];
    acc[row.department].push({
      user: row.first_name,
      completed: row.completed_tasks,
      total: row.total_tasks,
    });
    return acc;
  }, {});

  const groupedPieChart = pieChart.rows.reduce((acc, row) => {
    if (!acc[row.department]) {
      acc[row.department] = [];
    }

    acc[row.department].push({
      total_tasks: Number(row.total_tasks) || 0,
      completed_tasks: Number(row.completed_tasks) || 0,
      stuck_tasks: Number(row.stuck_tasks) || 0,
    });

    return acc;
  }, {});

  const stuckTasks = await db.query(
    `select first_name, title, due_date, department
    from tasks t
    inner join profiles p on t.created_for = p.user_id
    where t.organization_id = $1 and status = 'Stuck'`,
    [res.locals.currentProfile.organization_id],
  );

  const groupedStuckTasks = stuckTasks.rows.reduce((acc, row) => {
    if (!acc[row.department]) {
      acc[row.department] = [];
    }
    acc[row.department].push({
      first_name: row.first_name,
      title: row.title,
      due_date: row.due_date,
    });
    return acc;
  }, {});

  res.render("health.ejs", {
    year,
    barChart: groupedBarChart,
    pieChart: groupedPieChart,
    stuckTasks: groupedStuckTasks,
  });
});

app.get("/my-work", ensureLoggedIn, async (req, res) => {
  const date = new Date();
  const prior31days = new Date(date.getTime() - 1000 * 60 * 60 * 24 * 31);
  try {
    const pastTasks = await db.query(
      `select * 
      from tasks 
      inner join profiles on tasks.created_by = profiles.user_id 
      where created_for = $1 
        and due_date >= $2`,
      [req.user.id, prior31days],
    );

    res.render("my-work.ejs", {
      year,
      pastTasks: pastTasks.rows,
    });
  } catch (err) {
    console.error(err);
  }
});

app.post("/update-tasks", ensureLoggedIn, async (req, res) => {
  let taskIds = req.body.taskIds || [];
  if (!Array.isArray(taskIds)) taskIds = [taskIds];
  taskIds = taskIds.map(Number).filter(Boolean);

  if (taskIds.length === 0) return res.redirect("/tasks");

  try {
    const result = await db.query(
      `UPDATE tasks
      SET status = 'Completed', updated_at = now()
      WHERE id = ANY($1::int[])`,
      [taskIds],
    );
  } catch (err) {
    console.error(err);
  }

  res.redirect("/tasks");
});

app.post("/create-task", ensureLoggedIn, async (req, res) => {
  const { task, taskDescription, dueDate, priority, assignee } = req.body;

  try {
    await db.query(
      `insert into tasks(organization_id, title, description, priority, status, due_date, created_by, created_for) 
      values($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        res.locals.currentProfile.organization_id,
        task,
        taskDescription,
        priority,
        "Incomplete",
        dueDate,
        req.user.id,
        assignee,
      ],
    );
  } catch (err) {
    console.error(err);
  }
  res.redirect("/tasks");
});

app.get("/create-account", ensureLoggedIn, (req, res) => {
  res.render("create-account.ejs", {
    year,
    currentUser: req.user,
  });
});

app.post("/create-account", async (req, res) => {
  const { fName, lName, email, role } = req.body;
  const result = await db.query(
    `INSERT INTO profiles(user_id, first_name, last_name, role) 
    VALUES($1,$2,$3,$4) 
    RETURNING *`,
    [req.user.id, fName, lName, role],
  );

  res.redirect("/");
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs", {
    year,
  });
});

app.get("/admin", ensureLoggedIn, ensureAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `select * 
      from organizations 
      where owner_id = $1`,
      [req.user.id],
    );
    const org = result.rows[0];
    res.render("admin.ejs", { year, org });
  } catch (err) {
    console.log(err);
  }
});

app.post(
  "/admin/create-manager",
  ensureLoggedIn,
  ensureAdmin,
  async (req, res) => {
    const { manEmail, manPassword, manFirst, manLast, manRole } = req.body;
    const hash = await bcrypt.hash(manPassword, 10);

    const userResult = await db.query(
      `INSERT INTO users(email, password)
   VALUES($1, $2)
   RETURNING *`,
      [manEmail, hash],
    );
    const managerId = userResult.rows[0].id;
    const profileResult = await db.query(
      `insert into profiles(user_id, first_name, last_name, role, organization_id) 
    values($1, $2, $3, $4, $5) 
    returning *`,
      [
        managerId,
        manFirst,
        manLast,
        manRole,
        res.locals.currentProfile.organization_id,
      ],
    );

    res.redirect("/admin");
  },
);

app.post(
  "/admin/create-supervisor",
  ensureLoggedIn,
  ensureAdmin,
  async (req, res) => {
    const {
      supeEmail,
      supePassword,
      supeFirst,
      supeLast,
      supeRole,
      supeDepartment,
    } = req.body;
    const hash = await bcrypt.hash(supePassword, 10);
    const userResult = await db.query(
      `INSERT INTO users(email, password)
   VALUES($1, $2)
   RETURNING *`,
      [supeEmail, hash],
    );
    const supervisorId = userResult.rows[0].id;
    const profileResult = await db.query(
      `insert into profiles(user_id, first_name, last_name, role, department, organization_id) 
    values($1, $2, $3, $4, $5, $6) 
    returning *`,
      [
        supervisorId,
        supeFirst,
        supeLast,
        supeRole,
        supeDepartment,
        res.locals.currentProfile.organization_id,
      ],
    );

    res.redirect("/admin");
  },
);

app.post(
  "/admin/create-associate",
  ensureLoggedIn,
  ensureAdmin,
  async (req, res) => {
    const { empEmail, empPassword, empFirst, empLast, empRole, empDepartment } =
      req.body;
      const hash = await bcrypt.hash(empPassword, 10);
    const userResult = await db.query(
      `INSERT INTO users(email, password)
   VALUES($1, $2)
   RETURNING *`,
      [empEmail, hash],
    );
    const associateId = userResult.rows[0].id;
    const profileResult = await db.query(
      `insert into profiles(user_id, first_name, last_name, role, department, organization_id) 
    values($1, $2, $3, $4, $5, $6) 
    returning *`,
      [
        associateId,
        empFirst,
        empLast,
        empRole,
        empDepartment,
        res.locals.currentProfile.organization_id,
      ],
    );
    res.redirect("/admin");
  },
);

app.post("/admin", ensureLoggedIn, ensureAdmin, async (req, res) => {
  const { orgName } = req.body;
  const result = await db.query(
    `INSERT INTO organizations(org_name, owner_id) 
    VALUES($1, $2) 
    RETURNING *
    `,
    [orgName, req.user.id],
  );

  await db.query(
    `update profiles 
     set organization_id = $1 
     where user_id = $2
    `,
    [result.rows[0].id, req.user.id],
  );

  res.redirect("/admin");
});

app.post("/signup", async (req, res, next) => {
  const { email, password, confirmed_password } = req.body;

  if (password !== confirmed_password) {
    return res.send("Passwords do not match.");
  }

  const results = await db.query(
    `SELECT * 
    FROM users 
    WHERE email = $1`,
    [email],
  );

  if (results.rows.length > 0) {
    return res.send("Account already exists.");
  }

  const hash = await bcrypt.hash(password, 10);

  const result = await db.query(
    `INSERT INTO users(email, password) 
    VALUES($1, $2) 
    RETURNING *`,
    [email, hash],
  );

  req.login(result.rows[0], (err) => {
    if (err) return next(err);
    res.redirect("/create-account");
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
        const result = await db.query(`SELECT * FROM users WHERE email = $1`, [
          email,
        ]);

        if (result.rows.length === 0) return cb(null, false);

        const user = result.rows[0];

        const valid = await bcrypt.compare(password, user.password);

        if (!valid) return cb(null, false);

        return cb(null, user);
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
  const result = await db.query(
    `SELECT * 
     FROM users 
     WHERE id = $1`,
    [id],
  );
  cb(null, result.rows[0]);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
