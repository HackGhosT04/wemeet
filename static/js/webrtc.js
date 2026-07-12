// static/js/webrtc.js
const localVideo = document.getElementById('localVideo');
const videosContainer = document.getElementById('videos');
const muteMicBtn = document.getElementById('muteMic');
const toggleCamBtn = document.getElementById('toggleCam');
const leaveBtn = document.getElementById('leaveMeeting');
const participantsList = document.getElementById('participants-list');
const participantCountEl = document.getElementById('participant-count');
const connectionStatusEl = document.getElementById('connection-status');

let localStream;
let ws;
const peerConnections = {}; // userId -> RTCPeerConnection
const peerNames = {};        // userId -> name for labels
const remoteStreams = {};    // userId -> MediaStream
const pendingCandidates = {}; // userId -> RTCIceCandidate[]
let micEnabled = true;
let camEnabled = true;

function setParticipantCount(count) {
    if (!participantCountEl) return;
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    participantCountEl.textContent = `${safeCount} participant${safeCount === 1 ? '' : 's'}`;
}

function setConnectionStatus(message, tone = 'neutral') {
    if (!connectionStatusEl) return;
    connectionStatusEl.textContent = message;
    connectionStatusEl.dataset.tone = tone;
}

async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        setConnectionStatus('Camera and microphone ready. Connecting peers...', 'ready');
    } catch (err) {
        console.error('Media access denied:', err);
        setConnectionStatus('Camera or microphone blocked.', 'error');
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
    setConnectionStatus(`Connected to ${Object.keys(peerConnections).length} participant${Object.keys(peerConnections).length === 1 ? '' : 's'}`, 'ready');
}

function getRemoteStream(userId) {
    if (!remoteStreams[userId]) {
        remoteStreams[userId] = new MediaStream();
    }
    return remoteStreams[userId];
}

function flushPendingCandidates(userId) {
    const pc = peerConnections[userId];
    const queued = pendingCandidates[userId] || [];
    if (!pc || !queued.length) return;

    queued.forEach(candidate => {
        pc.addIceCandidate(candidate).catch(err => console.error('ICE candidate error:', err));
    });
    pendingCandidates[userId] = [];
}

function shouldInitiateOffer(peerUserId) {
    return String(USER_ID) > String(peerUserId);
}

function wirePeerConnection(userId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections[userId] = pc;

    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
        const remoteStream = getRemoteStream(userId);
        if (event.track) {
            const existingTracks = remoteStream.getTracks();
            const alreadyAdded = existingTracks.some(track => track.id === event.track.id);
            if (!alreadyAdded) {
                remoteStream.addTrack(event.track);
            }
        }
        if (event.streams && event.streams.length) {
            event.streams.forEach(stream => {
                stream.getTracks().forEach(track => {
                    const existingTracks = remoteStream.getTracks();
                    const alreadyAdded = existingTracks.some(existingTrack => existingTrack.id === track.id);
                    if (!alreadyAdded) {
                        remoteStream.addTrack(track);
                    }
                });
            });
        }
        addRemoteVideo(userId, remoteStream);
    };

    pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: userId,
                candidate: event.candidate
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            addRemoteVideo(userId, getRemoteStream(userId));
        }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            removeRemotePeer(userId);
        }
    };

    return pc;
}

function removeRemotePeer(userId) {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    delete remoteStreams[userId];
    delete pendingCandidates[userId];
    const wrapper = document.getElementById(`wrapper-${userId}`);
    if (wrapper) wrapper.remove();
    // Also remove from participant list
    removeParticipantFromList(userId);
}

function createPeerConnection(userId) {
    return peerConnections[userId] || wirePeerConnection(userId);
}

async function connectToPeer(userId, name, isOfferer) {
    peerNames[userId] = name || userId;
    addParticipantToList(userId, peerNames[userId]);
    const pc = createPeerConnection(userId);

    if (!isOfferer || pc.signalingState !== 'stable') {
        return pc;
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'offer',
            target: userId,
            sdp: pc.localDescription
        }));
    }

    return pc;
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/${MEETING_ID}?token=${AUTH_TOKEN}`);

    ws.onopen = () => console.log('Signaling connected');
    setConnectionStatus('Signaling connected. Waiting for media...', 'ready');

    setParticipantCount(typeof INITIAL_PARTICIPANT_COUNT === 'number' ? INITIAL_PARTICIPANT_COUNT : 0);

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const { type, userId, name } = data;

        switch (type) {
            case 'welcome':
                // Store own userId and name (already set)
                data.participants.forEach(p => {
                    connectToPeer(p.userId, p.name, shouldInitiateOffer(p.userId)).catch(err => {
                        console.error('Failed to prepare peer connection:', err);
                    });
                });
                if (typeof data.participantCount !== 'undefined') {
                    setParticipantCount(data.participantCount);
                }
                break;

            case 'user-joined':
                if (userId !== USER_ID) {
                    connectToPeer(userId, name, shouldInitiateOffer(userId)).catch(err => {
                        console.error('Failed to connect to new participant:', err);
                    });
                    if (typeof data.participantCount !== 'undefined') {
                        setParticipantCount(data.participantCount);
                    }
                }
                break;

            case 'offer':
                if (data.sender) {
                    const pc = createPeerConnection(data.sender);
                    peerNames[data.sender] = name || data.sender; // name might be missing
                    addParticipantToList(data.sender, peerNames[data.sender]);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    flushPendingCandidates(data.sender);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'answer',
                            target: data.sender,
                            sdp: pc.localDescription
                        }));
                    }
                }
                break;

            case 'answer':
                if (peerConnections[data.sender]) {
                    await peerConnections[data.sender].setRemoteDescription(new RTCSessionDescription(data.sdp));
                    flushPendingCandidates(data.sender);
                }
                break;

            case 'ice-candidate':
                if (data.sender && data.candidate) {
                    const pc = peerConnections[data.sender];
                    const candidate = new RTCIceCandidate(data.candidate);
                    if (!pc) {
                        if (!pendingCandidates[data.sender]) pendingCandidates[data.sender] = [];
                        pendingCandidates[data.sender].push(candidate);
                        break;
                    }
                    if (pc.remoteDescription) {
                        try {
                            await pc.addIceCandidate(candidate);
                        } catch (e) {
                            console.error('ICE candidate error:', e);
                        }
                    } else {
                        if (!pendingCandidates[data.sender]) pendingCandidates[data.sender] = [];
                        pendingCandidates[data.sender].push(candidate);
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
        setConnectionStatus('Disconnected from meeting.', 'error');
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