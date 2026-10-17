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



### Testing Status

- Verified that the backend server starts successfully.
- Tested avatar movement synchronization between two browser windows.
- Verified that the connected users panel works with the integrated frontend.
- Successfully built the frontend using the production build command.
- Tested basic WebRTC signaling message relaying, including offer, answer, and ICE candidate messages.


**Note:** Basic WebRTC signaling message relaying has been implemented and tested. However, a complete WebRTC audio connection between two browsers has not yet been verified. The current frontend integration still requires microphone controls and WebRTC peer connection functionality before end-to-end voice calling can be tested.

### Next Steps

- Coordinate with the frontend and WebRTC/audio team members to complete voice calling integration.
- Test microphone access and WebRTC peer connection establishment between two browsers.
- Verify offer-answer exchange, ICE candidate exchange, and actual audio communication.
- Verify proximity detection and nearby-user updates with the latest integrated frontend.
- Improve socket event error handling and document the event flow.
- Support final integration testing with the other team members.

## Project Status
In development. Features listed above represent the planned scope and may change as implementation progresses.

## Collaboration
Team members maintain individual Git branches and commit their contributions regularly. Branches will remain separate until the internship end review, in accordance with the project guidelines.
