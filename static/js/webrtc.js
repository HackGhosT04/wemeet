// static/js/webrtc.js
const localVideo = document.getElementById('localVideo');
const videosContainer = document.getElementById('videos');
const muteMicBtn = document.getElementById('muteMic');
const toggleCamBtn = document.getElementById('toggleCam');
const leaveBtn = document.getElementById('leaveMeeting');
const participantsList = document.getElementById('participants-list');
const participantCountEl = document.getElementById('participant-count');

let localStream;
let ws;
const peerConnections = {}; // userId -> RTCPeerConnection
const peerNames = {};        // userId -> name for labels
let micEnabled = true;
let camEnabled = true;

function setParticipantCount(count) {
    if (!participantCountEl) return;
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    participantCountEl.textContent = `${safeCount} participant${safeCount === 1 ? '' : 's'}`;
}

async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Media access denied:', err);
        alert('Camera and microphone access is required for this meeting.');
    }
}

function updateRemoteVideoLabel(userId, name) {
    const label = document.querySelector(`#wrapper-${userId} .label`);
    if (label) label.textContent = name;
}

function addRemoteVideo(userId, stream) {
    // Check if already exists
    if (document.getElementById(`video-${userId}`)) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper remote';
    wrapper.id = `wrapper-${userId}`;
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false;
    video.volume = 1;
    video.srcObject = stream;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = peerNames[userId] || userId;
    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videosContainer.appendChild(wrapper);

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(err => console.warn('Remote playback blocked until user interaction:', err));
    }
}

function removeRemotePeer(userId) {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    const wrapper = document.getElementById(`wrapper-${userId}`);
    if (wrapper) wrapper.remove();
    // Also remove from participant list
    removeParticipantFromList(userId);
}

function createPeerConnection(userId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections[userId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            addRemoteVideo(userId, event.streams[0]);
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: userId,
                candidate: event.candidate
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            removeRemotePeer(userId);
        }
    };

    return pc;
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${MEETING_ID}?token=${AUTH_TOKEN}`);

    ws.onopen = () => console.log('Signaling connected');

    setParticipantCount(typeof INITIAL_PARTICIPANT_COUNT === 'number' ? INITIAL_PARTICIPANT_COUNT : 0);

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const { type, userId, name } = data;

        switch (type) {
            case 'welcome':
                // Store own userId and name (already set)
                data.participants.forEach(p => {
                    peerNames[p.userId] = p.name;
                    addParticipantToList(p.userId, p.name);
                });
                if (typeof data.participantCount !== 'undefined') {
                    setParticipantCount(data.participantCount);
                }
                break;

            case 'user-joined':
                if (userId !== USER_ID) {
                    peerNames[userId] = name;
                    addParticipantToList(userId, name);
                    if (typeof data.participantCount !== 'undefined') {
                        setParticipantCount(data.participantCount);
                    }
                    // Create peer connection and send offer
                    const pc = createPeerConnection(userId);
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    ws.send(JSON.stringify({
                        type: 'offer',
                        target: userId,
                        sdp: pc.localDescription
                    }));
                }
                break;

            case 'offer':
                if (data.sender && !peerConnections[data.sender]) {
                    peerNames[data.sender] = name || data.sender; // name might be missing
                    const pc = createPeerConnection(data.sender);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    ws.send(JSON.stringify({
                        type: 'answer',
                        target: data.sender,
                        sdp: pc.localDescription
                    }));
                }
                break;

            case 'answer':
                if (peerConnections[data.sender]) {
                    await peerConnections[data.sender].setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
                break;

            case 'ice-candidate':
                if (peerConnections[data.sender] && data.candidate) {
                    try {
                        await peerConnections[data.sender].addIceCandidate(new RTCIceCandidate(data.candidate));
                    } catch (e) {
                        console.error('ICE candidate error:', e);
                    }
                }
                break;

            case 'user-left':
                removeRemotePeer(data.userId);
                removeParticipantFromList(data.userId);
                delete peerNames[data.userId];
                if (typeof data.participantCount !== 'undefined') {
                    setParticipantCount(data.participantCount);
                }
                break;
        }
    };

    ws.onerror = (err) => console.error('WebSocket error:', err);
    ws.onclose = () => {
        Object.keys(peerConnections).forEach(uid => removeRemotePeer(uid));
        console.log('Disconnected');
    };
}

function addParticipantToList(userId, name) {
    if (document.getElementById(`participant-${userId}`)) return;
    const div = document.createElement('div');
    div.id = `participant-${userId}`;
    div.textContent = name;
    participantsList.appendChild(div);
    // Update existing video label if any
    updateRemoteVideoLabel(userId, name);
}

function removeParticipantFromList(userId) {
    const div = document.getElementById(`participant-${userId}`);
    if (div) div.remove();
}

// Controls
muteMicBtn.addEventListener('click', () => {
    if (localStream) {
        micEnabled = !micEnabled;
        localStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
        muteMicBtn.textContent = micEnabled ? 'Mute Mic' : 'Unmute Mic';
    }
});

toggleCamBtn.addEventListener('click', () => {
    if (localStream) {
        camEnabled = !camEnabled;
        localStream.getVideoTracks().forEach(track => track.enabled = camEnabled);
        toggleCamBtn.textContent = camEnabled ? 'Disable Camera' : 'Enable Camera';
    }
});

leaveBtn.addEventListener('click', () => {
    window.location.href = '/dashboard';
});

// Start
startMedia().then(() => {
    connectWebSocket();
}).catch(err => console.error('Failed to start media:', err));