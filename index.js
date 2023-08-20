require('dotenv').config()
const express = require('express')
const app = express()
const PORT = process.env.PORT
const {graphqlHTTP} = require('express-graphql')
const schema = require('./schema')
const {graphqlUploadExpress} = require('graphql-upload')


app.use('/graphql',
    graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 }),
    graphqlHTTP((req) => ({
        schema,
        graphiql: true,
        context: {
            headers: req.headers
        }
})))

app.listen(PORT, (req, res) => {
    console.log("Server started at PORT " + PORT);
})
