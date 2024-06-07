const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8000;
const BASE_DIR = path.join(__dirname, 'files');

app.use(express.static('public'));

app.get('/files', (req, res) => {
    const requestedPath = req.query.path ? path.join(BASE_DIR, req.query.path) : BASE_DIR;

    // Prevent directory traversal attacks
    if (!requestedPath.startsWith(BASE_DIR)) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    fs.readdir(requestedPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }

        const fileInfos = files.map(file => {
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.relative(BASE_DIR, path.join(requestedPath, file.name))
            };
        });

        res.json(fileInfos);
    });
});

app.get('/preview', (req, res) => {
    const filePath = path.join(BASE_DIR, req.query.path);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(BASE_DIR)) {
        return res.status(400).send('Invalid path');
    }

    res.sendFile(filePath);
});

app.get('/download', (req, res) => {
    const filePath = path.join(BASE_DIR, req.query.path);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(BASE_DIR)) {
        return res.status(400).send('Invalid path');
    }

    res.download(filePath);
});

app.listen(PORT, () => {
    console.log(`SiPyWeb-Rewritten is running at http://localhost:${PORT}`);
});
