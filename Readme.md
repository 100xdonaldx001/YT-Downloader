# YT-Downloader

This project is a **Chrome extension + local Node.js helper** that sends a media URL to `yt-dlp` and downloads it on your machine.

## Required programs

- **Google Chrome (latest stable)**

The helper launcher (`start-helper.cmd`) will attempt to install missing dependencies automatically using `winget`:
- Node.js LTS
- FFmpeg
- yt-dlp (downloaded to the project root)

## Quick setup

1. Clone or copy this repo to a folder on your PC.
2. Start helper server:
   ```cmd
   start-helper.cmd
   ```
3. In Chrome, go to `chrome://extensions`:
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `extension` folder from this repo.

## Optional checks

Run these commands to confirm tools are installed:

```bash
node -v
ffmpeg -version
yt-dlp --version
```
