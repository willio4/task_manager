# Task Management Web Application

A full-stack web application for managing organizational tasks with **role-based access control**, supporting Admins, Managers, Supervisors, and Associates. Includes dashboards, task tracking, and analytics for departmental and organizational productivity.

---

## Features

- **Role-Based Access Control**: Admin, Manager, Supervisor, Associate  
- **Task Management**: Create, assign, update, and track tasks  
- **Interactive Dashboards**: Visualize departmental and organizational metrics  
- **Data Analytics**: Track task completion, stuck tasks, and overall progress  
- **Responsive Design**: Works on desktop and mobile devices  

---

## Getting Started

1. **Clone the repository**  
git clone https://github.com/willio4/task-management-app.git

2. **Install dependencies**  
npm install

3. **Set up your PostgreSQL database**  
- Install PostgreSQL locally if you don’t already have it.  
- Create a new database (e.g., `task_management`).  
- Use the provided database schema or SQL seed file (if included) to create tables and insert sample data.

4. **Configure the app to connect to your database**  
- Open `config/db.js` and update the `user`, `password`, `database`, and `host` fields with your PostgreSQL credentials.

5. **Start the application**  
nodemon

6. **Access the app**  
Open your browser at http://localhost:3000. Once your database is set up and seeded, you can create accounts and explore the app.

---

## Technologies Used

- **Backend:** Node.js, Express.js, Passport.js, RESTful APIs  
- **Frontend:** EJS, Bootstrap, Tailwind CSS, JavaScript  
- **Database:** PostgreSQL  
- **Data Visualization:** Chart.js  
- **Other:** Role-based authentication, session management  

---

