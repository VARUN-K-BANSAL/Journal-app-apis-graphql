const { Client } = require('pg');
const connectionString = process.env.POSTGRE_CONNECTION_URL

const client = new Client({
    connectionString: connectionString
});

client.connect(err => {
    if (err) {
        console.error('Connection error', err.stack);
    } else {
        console.log('Connected to the database!');
    }
});

// Define and create the ENUM type for userType if it doesn't exist
client.query("DO $$ BEGIN CREATE TYPE user_role AS ENUM ('student', 'teacher'); EXCEPTION WHEN duplicate_object THEN null; END $$;", (err, res) => {
    if (err) throw err;
    console.log('User role ENUM type checked/created');
});

// Define and create the ENUM type for attachmentType if it doesn't exist
client.query("DO $$ BEGIN CREATE TYPE attachment_kind AS ENUM ('image', 'video', 'url', 'pdf'); EXCEPTION WHEN duplicate_object THEN null; END $$;", (err, res) => {
    if (err) throw err;
    console.log('Attachment kind ENUM type checked/created');
});

client.query(`
    DROP TABLE IF EXISTS tags;
`, (err, res) => {
    if(err) throw err
    console.log("Tags table dropped");
})
client.query(`
    DROP TABLE IF EXISTS journals;
`, (err, res) => {
    if(err) throw err
    console.log("Journals table dropped");
})
client.query(`
    DROP TABLE IF EXISTS users;
`, (err, res) => {
    if(err) throw err
    console.log("Users table dropped");
})

// Create the users table if it doesn't exist
client.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        userType user_role NOT NULL
    );
`, (err, res) => {
    if (err) throw err;
    console.log('Users table checked/created');
});

// Create the journals table if it doesn't exist
client.query(`
    CREATE TABLE IF NOT EXISTS journals (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        publishedAt TIMESTAMP NOT NULL,
        attachmentType attachment_kind,
        attachmentUrl TEXT,
        teacherId INT,
        FOREIGN KEY (teacherId) REFERENCES users(id)
    );
`, (err, res) => {
    if (err) throw err;
    console.log('Journals table checked/created');
});

// Create the tags table if it doesn't exist
client.query(`
    CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        studentId INT,
        journalId INT,
        FOREIGN KEY (studentId) REFERENCES users(id),
        FOREIGN KEY (journalId) REFERENCES journals(id)
    );
`, (err, res) => {
    if (err) throw err;
    console.log('Tags table checked/created');
});

client.query(`
    DELETE FROM tags
`, (err, res) => {
    if(err) throw err;
    console.log("Previous tags deleted");
})
client.query(`
    DELETE FROM journals
`, (err, res) => {
    if(err) throw err;
    console.log("Previous journals deleted");
})
client.query(`
    DELETE FROM users
`, (err, res) => {
    if(err) throw err;
    console.log("Previous users deleted");
})

// Insert 6 users: 3 students and 3 teachers
client.query(`
    INSERT INTO users (username, password, userType) VALUES
    ('student1', 'password1', 'student'),
    ('student2', 'password2', 'student'),
    ('student3', 'password3', 'student'),
    ('teacher1', 'password4', 'teacher'),
    ('teacher2', 'password5', 'teacher'),
    ('teacher3', 'password6', 'teacher');
`, (err, res) => {
    if (err) throw err;
    console.log("Users data inserted");
});

client.on('error', (err) => {
    console.error('Unexpected error on PostgreSQL client:', err);
    // You can choose to reconnect here or exit the process
});


module.exports = client;
