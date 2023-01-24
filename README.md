# The Free MREdia Center
A Media Center MRE for Altspace that's 100% free.  
- Features:
    - Player:
        - Basic media controls: volume, rolloff
        - Video control: play, pause, stop, fastforward, rewind, seek
    - Youtube:
        - search by keyword
        - play direct link
        - proxy play (for region locks)
        - 3D play (for side by side videos)
        - audio visualization
    - Twitch:
        - search by keyword
        - auto play if the `twitch` query parameter is set to channel name
    - TV:
        - over 6000 IPTV channels
        - update every 24 hours
        - catogorized, with channel logos
    - Movie and Shows:
        - 250+ classic movies
        - 20+ TV shows and animes
- Prerequisites:
    - Youtube Player:
        - [ffmpeg](https://ffmpeg.org/)
        - [yt-dlp](https://github.com/yt-dlp/yt-dlp)
        - [nginx with hls](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-video-streaming-server-using-nginx-rtmp-on-ubuntu-20-04)
    - Twitch Player:
        - [twitch api key](https://dev.twitch.tv/docs/api/)
    - Other Players:
        - [database](https://www.mongodb.com/)
- Configure:
    ```bash
    cp .env.template .env
    ------------------------------------
    # edit .env
    # (not used) PROXY used to check if the url is streamable
    PROXY_URL=
    # (where the hls cache is stored)
    HLS_BASEDIR=
    # (rtmp server base url e.g. rtmp://freemre.com/hls)
    RTMP_BASEURL=
    # (stream base url for youtube audio visualization)
    STREAM_BASEURL=
    # (twitch api id and key)
    TWITCH_CLIENT_ID=
    TWITCH_CLIENT_SECRET=
    # database login details
    MONGODB_HOST=
    MONGODB_PORT=
    MONGODB_USER=
    MONGODB_PASSWORD=
    # database name
    TV_DATABASE=
    MOVIE_DATABASE=
    SHOW_DATABASE=
    USERCONTENT_DATABASE=
    ```
- Install, Build and Run:
```
    npm run install
    npm run build
    npm start
```

# Disclaimer:
```
All the videos are collected from open-source projects and personal collections.
This MRE App is non-profit and for personal use only.
Those who pirate stuff are losers,
those who sell free stuff are even bigger losers.
```

# Join us:
[![Discord](https://img.shields.io/badge/Discord-%237289DA.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/yStWGYcgKJ)
