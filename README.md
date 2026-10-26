# Surjo Medical Hospital

A simple hospital website with an AI report chat, built with plain HTML, CSS and JavaScript and a small Node.js server that talks to the ChatterMate API. The hospital name, phone numbers and all data are made up.

## Run it

1. Install Node.js 20 or newer.
2. Create a file named `.env` in the project folder with one line:
   `CHATTERMATE_API_KEY=your_key_here`
3. Start the server: `node --env-file=.env server.js`
4. Open http://localhost:3000 and click **Load sample data** on the Dashboard.

The `.env` file is ignored by Git, so your API key is never uploaded.

See [`README.txt`](README.txt) for the full list of pages, rules and how the AI chat works.
