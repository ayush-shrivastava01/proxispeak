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


### Testing Status

- Verified that the backend server starts successfully.
- Tested avatar movement synchronization between two browser windows.
- Verified that the connected users panel works with the integrated frontend.
- Successfully built the frontend using the production build command.
- Tested basic WebRTC signaling message relaying, including offer, answer, and ICE candidate messages.
- Automated tests pass: 100 px distance calculation, and WebRTC signaling is blocked outside 100 px and delivered inside 100 px.
- Verified with two browser tabs that avatar movement still synchronizes after the MongoDB and proximity changes.


**Note:** Basic WebRTC signaling message relaying has been implemented and tested on the backend. A complete WebRTC audio connection between two browsers is being integrated by the WebRTC/audio team member and has not yet been verified end to end by the backend side.

### Proximity Performance (Mid Review audit)

Measured with `npm run benchmark` (50 users, 300 queries, 100 px radius, MongoDB Atlas):

| Measurement | Average | p95 | Max |
|---|---|---|---|
| MongoDB server-side `$near` query time | 1.71 ms | 2.00 ms | 3 ms |
| Round trip including network (remote Atlas) | 58.28 ms | 92.85 ms | 983 ms |
| In-memory clustering | 0.03 ms | 0.05 ms | 0.56 ms |

The geospatial query itself runs in under 3 ms on the database. The round-trip time is higher because the Atlas cluster is remote; it is mostly network latency and would be lower with a local or same-region database.

### Socket Event Reference

| Event | Direction | Purpose |
|---|---|---|
| `moveAvatar` | client → server | Send the avatar's new `{x, y}` position |
| `avatarMoved` | server → clients | Broadcast another user's new position |
| `currentAvatars` / `getAvatars` | server ↔ client | List of all avatars and their positions |
| `nearbyAvatars` / `getNearbyAvatars` | server ↔ client | Users within 100 px, with distance |
| `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate` | client → server → target | WebRTC signaling, only within 100 px |
| `webrtc-out-of-range` | server → client | Signaling was blocked because the target is too far |
| `avatarLeft` | server → clients | A user disconnected |
| `getConnectedUsers` / `connectedUsers` | client ↔ server | IDs of all connected users |
| `roomLayout` | server → client | Saved office layout and obstacles (sent on connect and whenever a layout is saved) |
| `getRoomLayout` | client → server | Request a saved room, payload `{ roomId }` (default room is `main`) |
| `saveRoomLayout` | client → server | Save a room, payload `{ roomId, name, obstacles: [{type, x, y, width, height, blocksSound}] }` |
| `roomError` | server → client | The room data or room id was invalid, with a `message` |

### Room Persistence (REST API)

Office layouts and furniture obstacles (which block sound) are stored in MongoDB (`rooms` collection). If MongoDB is not connected, rooms are kept in memory.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/rooms/:roomId` | Load a room. Returns an empty room if it has not been saved yet. |
| PUT | `/api/rooms/:roomId` | Save a room. Body: `{ "name": "My Office", "obstacles": [{ "type": "desk", "x": 100, "y": 100, "width": 80, "height": 40, "blocksSound": true }] }` |

Rules: `roomId` may contain letters, numbers, `-` and `_` (up to 40 characters); an obstacle must lie inside the 900 x 600 office area; at most 200 obstacles per room. Invalid data returns HTTP 400 (or a `roomError` event over sockets).

### How to Run the Backend

1. In `backend`, run `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` (local MongoDB or Atlas).
3. `npm start` to run the server, `npm test` for the tests, `npm run benchmark` for the proximity benchmark.

### Next Steps

- Coordinate with the frontend and WebRTC/audio team members to complete voice calling integration.
- Test microphone access and WebRTC peer connection establishment between two browsers.
- Verify offer-answer exchange, ICE candidate exchange, and actual audio communication.
- Connect the frontend to the `nearbyAvatars` event so peer connections open and close based on proximity.
- Add Redis Pub/Sub so the Socket.io server can scale across multiple Node instances.
- Improve socket event error handling and document the event flow.
- Support final integration testing with the other team members.
- Frontend: draw the saved obstacles on the canvas and lower audio volume behind sound-blocking obstacles.

## Project Status
In development. Features listed above represent the planned scope and may change as implementation progresses.

## Collaboration
Team members maintain individual Git branches and commit their contributions regularly. Branches will remain separate until the internship end review, in accordance with the project guidelines.
