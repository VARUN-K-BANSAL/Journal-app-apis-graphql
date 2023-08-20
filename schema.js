const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLSchema,
  GraphQLNonNull,
  GraphQLBoolean,
} = require("graphql");
const jwt = require("jsonwebtoken");
// const db = require("./db");
const db = require("./postgreDB");
const SECRET_KEY = process.env.SECRET_KEY;
const { GraphQLUpload } = require("graphql-upload");
const cloudinary = require("cloudinary").v2;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUD_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUD_API_SECRET;

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const verifyToken = (token) => {
  try {
    // JWT_TOKEN[1] is taken because Bearer token in postman is used
    // In that token is coming as Bearer "token"
    console.log(token);
    console.log(SECRET_KEY);

    const JWT_TOKEN = token.split(" ");
    return jwt.verify(JWT_TOKEN[1], SECRET_KEY);
  } catch (err) {
    console.log(err);
    return {
      success: false,
      message: "Token is invalid",
    };
  }
};

const UserType = new GraphQLObjectType({
  name: "User",
  fields: () => ({
    username: { type: GraphQLString },
    token: { type: GraphQLString },
  }),
});

const JournalType = new GraphQLObjectType({
  name: "Journal",
  fields: () => ({
    success: { type: GraphQLBoolean },
    message: { type: GraphQLString },
    id: { type: GraphQLString },
    description: { type: GraphQLString },
    studentsTagged: { type: new GraphQLList(GraphQLString) },
    publishedAt: { type: GraphQLString },
    attachmentType: { type: GraphQLString },
    attachmentUrl: { type: GraphQLString },
  }),
});

const RootQuery = new GraphQLObjectType({
  name: "RootQueryType",
  fields: () => ({
    login: {
      type: UserType,
      args: {
        username: { type: GraphQLString },
        password: { type: GraphQLString },
      },
      resolve(parent, args) {
        // Mock authentication
        if (args.username && args.password) {
          const token = jwt.sign({ username: args.username }, SECRET_KEY, {
            expiresIn: "1h",
          });
          return { username: args.username, token };
        }
        throw new Error("Invalid credentials");
      },
    },
    journals: {
      type: new GraphQLList(JournalType),
      async resolve(parent, args, context) {
        const token = context.headers.authorization;
        if (!token) {
          throw new Error("Token not provided!");
        }
        const verification = verifyToken(token);

        if (verification.success == false || verification.exp == undefined) {
          return verification;
        }

        console.log(verification);

        return new Promise((resolve, reject) => {
          db.query(
            "SELECT * FROM users WHERE username = $1;",
            [verification.username],
            (err, user) => {
              if (err) throw err;
              if (user.rows.length === 0)
                return resolve({ success: false, message: "User not found" });

              if (user.rows[0].usertype == "teacher") {
                db.query(
                  "SELECT * FROM journals WHERE teacherId = $1",
                  [user.rows[0].id],
                  (err, journals) => {
                    console.log(journals);
                    if (err) throw err;

                    // Map over the journals and return a promise for each journal
                    const promises = journals.rows.map((journal) => {
                      return new Promise((res, rej) => {
                        db.query(
                          "SELECT * FROM tags WHERE journalId = $1",
                          [journal.id],
                          (err, tags) => {
                            if (err) return rej(err);

                            const tagsData = tags.rows.map(
                              (tag) => tag.studentid
                            );

                            const temp = {
                              success: true,
                              message: "fetched successfully",
                              id: journal.id,
                              description: journal.description,
                              studentsTagged: tagsData,
                              publishedAt: journal.publishedat,
                              attachmentType: journal.attachmenttype,
                              attachmentUrl: journal.attachmenturl,
                            };
                            res(temp);
                          }
                        );
                      });
                    });

                    // Wait for all promises to resolve
                    Promise.all(promises)
                      .then((data) => {
                        resolve(data);
                      })
                      .catch((err) => {
                        reject(err);
                      });
                  }
                );
              } else {
                db.query(
                  "SELECT * FROM tags WHERE studentId = $1",
                  [user.rows[0].id],
                  (err, tags) => {
                    console.log(tags);
                    if (err) throw err;
                    let results = []; // Array to collect the results

                    // Map over the tags and return a promise for each journal
                    const promises = tags.rows.map((tag) => {
                      return new Promise((res, rej) => {
                        db.query(
                          "SELECT * FROM journals WHERE id = $1",
                          [tag.journalid],
                          (err, journal) => {
                            if (err) return rej(err);

                            const currentTime = new Date();
                            const publishedTime = new Date(
                              journal.rows[0].publishedat
                            );

                            // Check if publishedAt time is less than current time
                            if (publishedTime <= currentTime) {
                              const temp = {
                                success: true,
                                message: "fetched successfully",
                                id: journal.rows[0].id,
                                description: journal.rows[0].description,
                                publishedAt: journal.rows[0].publishedat,
                                attachmentType: journal.rows[0].attachmenttype,
                                attachmentUrl: journal.rows[0].attachmenturl,
                              };
                              results.push(temp); // Push to the results array
                            }
                            res(); // Always resolve the promise
                          }
                        );
                      });
                    });

                    // Wait for all promises to resolve
                    Promise.all(promises)
                      .then(() => {
                        resolve(results); // Resolve with the results array
                      })
                      .catch((err) => {
                        reject(err);
                      });
                  }
                );
              }
            }
          );
        });
      },
    },
  }),
});

const Mutation = new GraphQLObjectType({
  name: "Mutation",
  fields: {
    createJournal: {
      type: JournalType,
      args: {
        description: { type: new GraphQLNonNull(GraphQLString) },
        studentsTagged: { type: new GraphQLList(GraphQLString) },
        publishedAt: { type: new GraphQLNonNull(GraphQLString) },
        attachmentType: { type: GraphQLString },
        attachmentFile: { type: GraphQLUpload },
      },
      async resolve(parent, args, context) {
        const token = context.headers.authorization;
        if (!token) {
          throw new Error("Token not provided!");
        }
        const verification = verifyToken(token);

        if (verification.success == false || verification.exp == undefined) {
          return verification;
        }

        // Uploading file to cloudinary and storing the accessible URL in the attachmentUrl variable
        let attachmentUrl = null;
        if (args.attachmentFile) {
          const { createReadStream } = await args.attachmentFile;
          const result = await new Promise((resolve, reject) => {
            createReadStream().pipe(
              cloudinary.uploader.upload_stream((error, result) => {
                if (error) reject(error);
                resolve(result);
              })
            );
          });
          attachmentUrl = result.secure_url;
        }

        console.log(verification);

        console.log(attachmentUrl);

        return new Promise((resolve, reject) => {
          db.query(
            "SELECT * FROM users WHERE username = $1;",
            [verification.username],
            (err, teacher) => {
              if (err)
                return resolve({ success: false, message: "Invalid token" });
              if (teacher.rows.length === 0)
                return resolve({ success: false, message: "User not found" });
              db.query(
                "INSERT INTO journals (description, publishedAt, attachmentType, attachmentUrl, teacherId) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                [
                  args.description,
                  args.publishedAt,
                  args.attachmentType,
                  attachmentUrl,
                  teacher.rows[0].id,
                ],
                (err, result) => {
                  if (err) return reject(err);

                  let id = result.rows[0].id; // Get the returned ID
                  let students = args.studentsTagged;
                  let values = students
                    .map((student, index) => `(${student}, ${id})`)
                    .join(", ");
                  let query = `INSERT INTO tags (studentId, journalId) VALUES ${values};`;
                  console.log(query);
                  db.query(query, (err, res) => {
                    console.log(err);
                    if (err) {
                      let deleteQuery = "DELETE FROM journals WHERE id = $1";

                      db.query(deleteQuery, [id], (err, resp) => {
                        if (err) reject(err);
                        resolve({
                          success: false,
                          message:
                            "Due to some error in tags data cannot be inserted",
                        });
                      });
                    } else {
                      resolve({
                        success: true,
                        message: "Journal created successfully",
                        id: id,
                        ...args,
                      });
                    }
                  });
                }
              );
            }
          );
        });
      },
    },
    deleteJournal: {
      type: JournalType,
      args: {
        journalId: { type: GraphQLString },
      },
      resolve(parent, args, context) {
        const token = context.headers.authorization;
        if (!token) {
          throw new Error("Token not provided!");
        }
        const verification = verifyToken(token);
        if (verification.success == false || verification.exp == undefined) {
          return verification;
        }

        console.log(verification);

        return new Promise((resolve, reject) => {
          db.query(
            "SELECT * FROM users WHERE username = $1;",
            [verification.username],
            (err, teacher) => {
              if (err)
                return resolve({ success: false, message: "Invalid token" });
              if (teacher.rows.length === 0)
                return resolve({ success: false, message: "User not found" });

              db.query(
                "SELECT * FROM journals WHERE id = $1;",
                [args.journalId],
                (err, journal) => {
                  console.log(journal);
                  if (err) return reject(err);
                  if (journal.rows.length == 0) {
                    return resolve({
                      success: false,
                      message: "No journal exists with specified id",
                    });
                  }

                  // teacher does not have access to delete the journal
                  // console.log(journal.rows[0].teacherid);
                  // console.log(teacher.rows);
                  if (journal.rows[0].teacherid != teacher.rows[0].id) {
                    return resolve({
                      success: false,
                      message:
                        "You do not have permission to delete the journal",
                    });
                  }

                  db.query(
                    "DELETE FROM tags WHERE journalId = $1;",
                    [journal.rows[0].id],
                    (err, res) => {
                      if (err) return reject(err);
                      db.query(
                        "DELETE FROM journals WHERE id = $1;",
                        [journal.rows[0].id],
                        (err, resu) => {
                          if (err) return reject(err);
                          if (resu.rowCount != 0)
                            return resolve({
                              success: true,
                              message: "Journal deleted successfully",
                              ...args,
                            });
                          else
                            return resolve({
                              success: true,
                              message: "No Journal Exists with specified id",
                              ...args,
                            });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        });
      },
    },
    updateJournal: {
      type: JournalType,
      args: {
        description: { type: GraphQLString },
        studentsTagged: { type: new GraphQLList(GraphQLString) },
        publishedAt: { type: GraphQLString },
        attachmentType: { type: GraphQLString },
        attachmentUrl: { type: GraphQLString },
        teacherId: { type: GraphQLString },
        journalId: { type: GraphQLString },
      },
      resolve(parent, args, context) {
        const token = context.headers.authorization;
        if (!token) {
          throw new Error("Token not provided!");
        }
        const verification = verifyToken(token);

        if (verification.success == false || verification.exp == undefined) {
          return verification;
        }

        console.log(verification);

        return new Promise((resolve, reject) => {
          db.query(
            "SELECT * FROM users WHERE username = $1",
            [verification.username],
            (err, result) => {
              if (err)
                return resolve({ success: false, message: "Invalid token" });
              const teacher = result.rows[0];

              db.query(
                "SELECT * FROM journals WHERE id = $1",
                [args.journalId],
                (err, result) => {
                  if (err) return reject(err);
                  const journal = result.rows[0];
                  console.log(journal);

                  if (!journal) {
                    return resolve({
                      success: false,
                      message: "No journal exists with specified id",
                    });
                  }

                  // teacher does not have access to delete the journal
                  if (journal.teacherid !== teacher.id) {
                    return resolve({
                      success: false,
                      message:
                        "You do not have permission to update the journal",
                    });
                  }

                  const reqDescription =
                    args.description || journal.description;
                  const reqPublishedAt =
                    args.publishedAt || journal.publishedat;
                  const reqAttachmentType =
                    args.attachmentType || journal.attachmenttype;
                  const reqAttachmentUrl =
                    args.attachmentUrl || journal.attachmenturl;
                  const reqTeacherId = args.teacherId || journal.teacherid;

                  db.query(
                    "UPDATE journals SET description = $1, publishedAt = $2, attachmentType = $3, attachmentUrl = $4, teacherId = $5 WHERE id = $6",
                    [
                      reqDescription,
                      reqPublishedAt,
                      reqAttachmentType,
                      reqAttachmentUrl,
                      reqTeacherId,
                      journal.id,
                    ],
                    (err, resp) => {
                      if (err) return reject(err);

                      if (resp.rowCount > 0 && args.studentsTagged) {
                        db.query(
                          "DELETE FROM tags WHERE journalId = $1",
                          [journal.id],
                          (err, res) => {
                            if (err) return reject(err);

                            const values = args.studentsTagged
                              .map(
                                (studentId) => `(${studentId}, ${journal.id})`
                              )
                              .join(", ");
                            const addQuery = `INSERT INTO tags (studentId, journalId) VALUES ${values}`;

                            db.query(addQuery, (err, res) => {
                              if (err) return reject(err);
                              return resolve({
                                success: true,
                                message: "Journal updated successfully",
                                ...args,
                              });
                            });
                          }
                        );
                      } else {
                        return resolve({
                          success: true,
                          message: "No Journal Exists with specified id",
                          ...args,
                        });
                      }
                    }
                  );
                }
              );
            }
          );
        });
      },
    },
  },
});

module.exports = new GraphQLSchema({
  query: RootQuery,
  mutation: Mutation,
});
