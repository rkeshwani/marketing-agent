const app = require('./src/server');
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  // The scheduler interval setup is already within server.js,
  // so it will be active when the server starts.
  // If it was outside app.listen, we'd need to ensure it's called here.
});
