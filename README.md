# JellyRabbit Studio

Static marketing site for JellyRabbit, a design and development agency. Built with semantic HTML and modern CSS for deployment on Netlify.

## Getting Started

This is a static site, so you can open `index.html` directly in a browser or serve it locally with any static file server.

```bash
# Example using Python
python -m http.server
```

Then visit [http://localhost:8000](http://localhost:8000).

## Deploying to Netlify

1. Push the repository to GitHub.
2. In Netlify, create a new site from Git.
3. Select this repository and use the following settings:
   - **Build command:** none
   - **Publish directory:** `.`
4. Deploy!

## Project Structure

```
.
├── assets
│   ├── css
│   │   └── styles.css
│   └── js
│       └── main.js
├── index.html
└── README.md
```

Feel free to add additional pages, components, or integrations as JellyRabbit grows.
