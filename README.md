# ProxiSpeak – Geospatial Proximity Audio Ecosystem

## Overview
ProxiSpeak is a virtual office application designed to make online interactions feel more natural. Users can move their avatars around a shared 2D workspace and communicate through proximity-based audio.

When users are close to each other, their voices can be heard more clearly. As they move farther apart, audio volume can decrease based on distance.

## Problem Statement
Traditional online meeting platforms often rely on fixed meeting rooms or manually controlled audio. ProxiSpeak aims to create a more natural virtual workspace where conversations are influenced by the distance between users.

## Key Features (Planned and In Development)
- 2D virtual office with movable avatars
- Real-time user movement and coordinate updates
- Geospatial proximity detection
- WebRTC-based real-time audio communication
- Distance-based audio attenuation
- Spatial audio and left/right panning
- Persistent office layouts and furniture
- Support for multiple concurrent users

## Technology Stack
### Frontend
- React.js
- HTML5 Canvas
- Web Audio API

### Backend
- Node.js
- Express.js
- Socket.io

### Database and Scaling
- MongoDB and geospatial queries
- Redis Pub/Sub

### Real-Time Communication
- WebRTC

## Development Roadmap
- Week 1: Virtual office, avatar movement, real-time coordinates and initial backend setup
- Week 2: Proximity detection and two-browser WebRTC audio
- Week 3: Dynamic audio attenuation and scaling with Redis Pub/Sub
- Week 4: Room persistence, spatial audio, integration and testing

## Team
This project is being developed collaboratively by a team of five members.

- Ayush Shrivastava – Team Lead and Frontend Development
- Chandra – Backend and Geospatial
- Soumi Bera – Backend and Real-Time Communication
- Shreya Bera – WebRTC and Audio
- Aditya Kumar Mishra – Scaling and Persistence

### Contributions

- Ayush Shrivastava: project setup and the React canvas (office, avatars, keyboard movement, connected users panel).
- Shreya Bera: four audio modules on the `shreya-webrtc-audio` branch (`audio/`): microphone access, WebRTC peer connection, call manager and spatial audio (5 commits, 20 to 24 October 2026). They are not yet connected to the application.
- Soumi Bera: backend (Socket.io, MongoDB, proximity, signaling, room persistence, Redis, tests, load test) and the frontend integration described below.
- Chandra and Aditya Kumar Mishra: no commits in their branches.

## Backend and Integration Work – Soumi Bera

### Completed Work

- Set up the Node.js and Express.js backend server.
- Configured Socket.IO for real-time communication.
- Implemented real-time avatar movement broadcasting.
- Implemented location sharing between connected users.
- Implemented basic WebRTC signaling message relay for offers, answers, and ICE candidates.
- Added socket disconnection handling and nearby user list updates.
- Integrated the latest frontend changes with the backend code.
- Committed and pushed the frontend integration changes to the `soumi-bera-realtime` branch.
- Added MongoDB (Mongoose) with an `Avatar` model that stores avatar `[x, y]` pixel positions with a geospatial `2d` index.
- Implemented 100 px proximity detection using MongoDB `$near` queries (in-memory fallback if MongoDB is not connected).
- Added the `nearbyAvatars` socket event, which tells each user who is currently within earshot.
- Limited WebRTC signaling (offer, answer, ICE candidate) to users within 100 px of each other.
- Added automated tests (`npm test`) and a proximity benchmark (`npm run benchmark`).
- Added room persistence: office layouts and sound-blocking obstacles are saved in MongoDB through a REST API (`GET/PUT /api/rooms/:roomId`) and socket events (`getRoomLayout`, `saveRoomLayout`, `roomLayout`), with automated tests.
- Added proximity clusters and a `$geoWithin` area query (`GET /api/clusters`, `GET /api/area`, `getClusters` event), with automated tests.
- Added a `blocked` flag to the `nearbyAvatars` list: a user is marked as blocked when a sound-blocking obstacle lies on the straight line between the two avatars (line-of-sight check).
- Added a rate limit on `moveAvatar` (position updates faster than about 60 per second are ignored).
- Added a position store that keeps avatar positions in memory or, when `REDIS_URL` is set, in Redis; Socket.io events are shared between server processes through the Redis adapter.
- Added automatic cleanup of avatars whose user is no longer connected, and a `clear-redis.js` script for a manual cleanup.
- Added a 50-user load test (`npm run loadtest`) and extended `/health` with the position store type and the server memory.
- Frontend: the canvas shows the 100 px earshot radius, a green ring around users who can be heard, an orange ring around users behind an obstacle, and the saved obstacles; avatars can also be moved by clicking, and other avatars move smoothly.
- Frontend: a proximity audio module (`frontend/src/proximityAudio.js`) with a microphone button. It opens WebRTC audio connections with users within earshot, sets the volume by distance, pans left/right by position and lowers the volume for users behind sound-blocking obstacles. Verified with two browser tabs: the voice is heard when the avatars are close and stops when they move apart.
- Pull Request #1 (`soumi-bera-realtime`) was merged into `main` on 12 November 2026.

### Testing Status

- Verified that the backend server starts successfully.
- Tested avatar movement synchronization between two browser windows.
- Verified that the connected users panel works with the integrated frontend.
- Successfully built the frontend using the production build command.
- Tested basic WebRTC signaling message relaying, including offer, answer, and ICE candidate messages.
- All 13 automated tests pass (`npm test`): 100 px distance and nearby-user calculation, proximity clusters, users inside a circle, line-of-sight check for obstacles, the position store (memory and a fake Redis client), room validation and persistence, the `blocked` flag over sockets, WebRTC signaling blocked outside 100 px and delivered inside 100 px, and offer/answer/ICE forwarding.
- A 50-user load test connected all 50 users without failure (see "Load Test" below).
- Verified with two browser tabs that avatar movement still synchronizes after the MongoDB and proximity changes.
- Verified in two browser tabs that the earshot radius, green ring, saved obstacles and click-to-move work.
- Verified with two browser tabs that proximity audio works end to end (microphone, WebRTC connection, volume by distance).


**Note:** Basic WebRTC signaling and the proximity audio have been implemented and verified with two browser tabs on one computer. The audio modules of the WebRTC/audio team member (`shreya-webrtc-audio` branch, `audio/`) are not used by the application.

### Proximity Performance (Mid Review audit)

Measured with `npm run benchmark` (50 users, 300 queries, 100 px radius, MongoDB Atlas):

| Measurement | Average | p95 | Max |
|---|---|---|---|
| MongoDB server-side `$near` query time | 1.71 ms | 2.00 ms | 3 ms |
| Round trip including network (remote Atlas) | 58.28 ms | 92.85 ms | 983 ms |
| In-memory clustering | 0.03 ms | 0.05 ms | 0.56 ms |

The geospatial query itself runs in under 3 ms on the database. The round-trip time is higher because the Atlas cluster is remote; it is mostly network latency and would be lower with a local or same-region database.

### Load Test

Run with `npm run loadtest` (50 users, 15 seconds, server running without MongoDB so that the server itself is measured):

| Measurement | Result |
|---|---|
| Users connected | 50 of 50 (0 failed) |
| Position updates sent | about 460 per second |
| Events received by the clients | about 23,000 per second |
| Server answer time | average 19 ms, 95th percentile 57 ms, maximum 74.5 ms |
| Server memory | 50 MB before, 71 MB during, 71 MB after |
| Avatars left after stopping | 0 |

The result depends on the machine; it shows that 50 simultaneous users are handled without errors.

### Socket Event Reference

| Event | Direction | Purpose |
|---|---|---|
| `moveAvatar` | client → server | Send the avatar's new `{x, y}` position |
| `avatarMoved` | server → clients | Broadcast another user's new position |
| `currentAvatars` / `getAvatars` | server ↔ client | List of all avatars and their positions |
| `nearbyAvatars` / `getNearbyAvatars` | server ↔ client | Users within 100 px, as `[{ userId, distance, blocked }]`; `blocked` is true when a sound-blocking obstacle lies between the two avatars |
| `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate` | client → server → target | WebRTC signaling, only within 100 px |
| `webrtc-out-of-range` | server → client | Signaling was blocked because the target is too far |
| `avatarLeft` | server → clients | A user disconnected |
| `getConnectedUsers` / `connectedUsers` | client ↔ server | IDs of all connected users |
| `roomLayout` | server → client | Saved office layout and obstacles (sent on connect and whenever a layout is saved) |
| `getRoomLayout` | client → server | Request a saved room, payload `{ roomId }` (default room is `main`) |
| `saveRoomLayout` | client → server | Save a room, payload `{ roomId, name, obstacles: [{type, x, y, width, height, blocksSound}] }` |
| `roomError` | server → client | The room data or room id was invalid, with a `message` |
| `getClusters` | client → server | Ask for the current proximity clusters |
| `proximityClusters` | server → client | Groups of users within 100 px of each other, `{ radius, clusters: [[userId, ...]] }` |

### Proximity Queries (REST API)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/clusters` | Groups of users who are within 100 px of each other (directly or through a chain of users). Only groups of two or more are returned. |
| GET | `/api/area?x=450&y=300&radius=100` | Users inside a circle, using a MongoDB `$geoWithin` query (falls back to memory if MongoDB is not connected). `radius` is optional (default 100, maximum 1000). |

### Room Persistence (REST API)

Office layouts and furniture obstacles (which block sound) are stored in MongoDB (`rooms` collection). If MongoDB is not connected, rooms are kept in memory.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/rooms/:roomId` | Load a room. Returns an empty room if it has not been saved yet. |
| PUT | `/api/rooms/:roomId` | Save a room. Body: `{ "name": "My Office", "obstacles": [{ "type": "desk", "x": 100, "y": 100, "width": 80, "height": 40, "blocksSound": true }] }` |

Rules: `roomId` may contain letters, numbers, `-` and `_` (up to 40 characters); an obstacle must lie inside the 900 x 600 office area; at most 200 obstacles per room. Invalid data returns HTTP 400 (or a `roomError` event over sockets).

### Redis (optional scaling)

Without `REDIS_URL` the server runs as a single process and keeps avatar positions in memory. With `REDIS_URL` set (for example a free Upstash database), the server

- shares Socket.io events between several server processes through `@socket.io/redis-adapter`, and
- keeps avatar positions in Redis instead of memory.

Avatars whose user is no longer connected are removed automatically every 30 seconds. To remove all stored positions manually (with the server stopped), run `node clear-redis.js`.

Current limitation: Redis has been connected and used by a single server process; running two server processes together has not been tested yet.

### How to Run the Backend

1. In `backend`, run `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` (local MongoDB or Atlas). Optionally set `REDIS_URL` to use Redis.
3. `npm start` to run the server, `npm test` for the tests, `npm run benchmark` for the proximity benchmark, `npm run loadtest` for the 50-user load test (start the server first).

### How to Run the Frontend

1. In `frontend`, run `npm install` and then `npm run dev`.
2. Open the shown address (for example `http://localhost:5173`) in two browser tabs. Move with the arrow keys, W A S D, or by clicking on the office.

### Next Steps

- Test the proximity audio between two different computers (different networks may need a TURN server).
- Run two server processes together with Redis and verify that proximity and signaling work across them.
- Improve socket event error handling and document the event flow.
- Support final integration testing with the other team members.
- Merge the remaining branches of the other team members (`shreya-webrtc-audio`, `ayush-frontend`) into `main` if the mentor approves.

## Project Status
In development. Features listed above represent the planned scope and may change as implementation progresses.

## Collaboration
Team members maintain individual Git branches and commit their contributions regularly. Branches will remain separate until the internship end review, in accordance with the project guidelines.