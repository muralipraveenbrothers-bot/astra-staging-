import { useEffect, useRef, useState } from "react";
import { Copy, MessageCircle, Mic, MicOff, Phone, PhoneOff, Send, Users, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type PeerInfo = { id: string; name: string; role: string };
type ChatLine = { from: string; text: string; at: string };
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export function StaffCallPanel() {
  const { account, accounts } = useAuth();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("doctor-command");
  const [joined, setJoined] = useState(false);
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [linkTarget, setLinkTarget] = useState("reception");
  const [remoteStreams, setRemoteStreams] = useState<Array<{ id: string; stream: MediaStream }>>([]);
  const socket = useRef<WebSocket | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());

  const closePeer = (id: string) => { peers.current.get(id)?.close(); peers.current.delete(id); setRemoteStreams((s) => s.filter((x) => x.id !== id)); };
  const makePeer = (id: string, initiate: boolean) => {
    const existing = peers.current.get(id); if (existing) return existing;
    const pc = new RTCPeerConnection(rtcConfig); peers.current.set(id, pc);
    localStream.current?.getTracks().forEach((track) => pc.addTrack(track, localStream.current!));
    pc.onicecandidate = (e) => { if (e.candidate) socket.current?.send(JSON.stringify({ type: "ice", to: id, payload: e.candidate })); };
    pc.ontrack = (e) => setRemoteStreams((current) => current.some((x) => x.id === id) ? current : [...current, { id, stream: e.streams[0] }]);
    if (initiate) void pc.createOffer().then((offer) => pc.setLocalDescription(offer).then(() => socket.current?.send(JSON.stringify({ type: "offer", to: id, payload: offer }))));
    return pc;
  };

  useEffect(() => () => endCall(), []);

  useEffect(() => {
    const openFromDashboard = (event: Event) => {
      const detail = (event as CustomEvent<{ video?: boolean; room?: string }>).detail;
      setOpen(true);
      if (!joined) {
        setCamera(Boolean(detail?.video));
        if (detail?.room) setRoom(detail.room.replace(/[^a-zA-Z0-9_-]/g, "-"));
      }
    };
    window.addEventListener("astra-staff-connect-open", openFromDashboard);
    return () => window.removeEventListener("astra-staff-connect-open", openFromDashboard);
  }, [joined]);

  async function startCall() {
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") { toast.error("HTTPS is required for microphone and camera access on another device"); return; }
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: camera });
      if (localVideo.current) localVideo.current.srcObject = localStream.current;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const token = localStorage.getItem("astra.serverToken") ?? "";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/staff-call?token=${encodeURIComponent(token)}`);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "join", room, name: account?.name ?? "Staff", role: account?.role ?? "staff", targetRole: room.startsWith("doctor") ? "doctor" : undefined }));
      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "joined") { setJoined(true); (message.peers as PeerInfo[]).forEach((p) => makePeer(p.id, true)); toast.success(`Joined ${room}`, { description: `${message.peers.length} staff connected` }); }
        if (message.type === "peer-joined") makePeer(message.peer.id, false);
        if (message.type === "peer-left") closePeer(message.peerId);
        if (message.type === "offer") { const pc = makePeer(message.from, false); await pc.setRemoteDescription(message.payload); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); ws.send(JSON.stringify({ type: "answer", to: message.from, payload: answer })); }
        if (message.type === "answer") await peers.current.get(message.from)?.setRemoteDescription(message.payload);
        if (message.type === "ice") await peers.current.get(message.from)?.addIceCandidate(message.payload).catch(() => undefined);
        if (message.type === "chat") setChat((c) => [...c, { from: message.from, text: message.text, at: message.at }]);
        if (message.type === "error") toast.error(message.message ?? "Call failed");
      };
      ws.onerror = () => toast.error("Staff communication connection failed");
    } catch (error) { toast.error("Microphone or camera permission failed", { description: error instanceof Error ? error.message : String(error) }); }
  }

  function endCall() {
    socket.current?.send(JSON.stringify({ type: "leave" })); socket.current?.close(); socket.current = null;
    localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
    peers.current.forEach((peer) => peer.close()); peers.current.clear(); setRemoteStreams([]); setJoined(false);
  }
  function toggleMic() { const next = !mic; localStream.current?.getAudioTracks().forEach((track) => { track.enabled = next; }); setMic(next); }
  function sendChat() { const text = chatText.trim(); if (!text || !joined) return; socket.current?.send(JSON.stringify({ type: "chat", text })); setChat((c) => [...c, { from: "You", text, at: new Date().toISOString() }]); setChatText(""); }
  async function copyRoomLink() {
    const target = accounts.find((a) => a.id === linkTarget); if (!target) return;
    const rolePath = target.role === "radiotech" ? "radiology" : target.role === "finance" ? "billing" : target.role;
    const response = await fetch("/api/communications/secure-links", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("astra.serverToken") ?? ""}` }, body: JSON.stringify({ targetAccountId: target.id, route: `/${rolePath}?call=${encodeURIComponent(room)}`, expiresMinutes: 60 }) });
    if (!response.ok) { toast.error("Only Doctor or CEO can create a private link"); return; }
    const body = await response.json(); const url = `${location.origin}${location.pathname}#${body.path}`; await navigator.clipboard.writeText(url); toast.success(`Private link copied for ${target.name}`, { description: "Expires in 60 minutes and rejects every other account." });
  }

  return <div className="border-t border-slate-800 bg-slate-950/95 px-4 py-2">
    {!open ? <button onClick={() => setOpen(true)} className="rounded-lg border border-emerald-400/40 bg-slate-900 px-3 py-2 text-xs font-bold text-emerald-200"><MessageCircle size={14} className="mr-1 inline" /> Staff Connect</button> :
    <div className="mx-auto w-full max-w-[720px] rounded-2xl border border-emerald-400/30 bg-slate-950 p-4 shadow-xl">
      <div className="flex items-center justify-between"><b className="flex items-center gap-2 text-sm text-white"><Users size={15} /> Astra Staff Connect</b><button onClick={() => { endCall(); setOpen(false); }} className="text-slate-500">×</button></div>
      <div className="mt-3 flex gap-2"><input value={room} onChange={(e) => setRoom(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "-"))} disabled={joined} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white" />{account && ["doctor","ceo"].includes(account.role) && <button onClick={() => void copyRoomLink()} title="Create account-bound call link" className="rounded-lg border border-slate-700 px-2 text-slate-300"><Copy size={13} /></button>}</div>
      {account && ["doctor","ceo"].includes(account.role) && <select value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-300">{accounts.filter((a) => !["doctor","ceo"].includes(a.role)).map((a) => <option key={a.id} value={a.id}>Private link for {a.name} · {a.role}</option>)}</select>}
      <p className="mt-2 text-[10px] text-slate-500">Encrypted browser media uses WebRTC. Staff may call Doctor Command; doctors and CEO can open department rooms.</p>
      <div className="mt-3 grid grid-cols-2 gap-2"><video ref={localVideo} autoPlay muted playsInline className="h-24 w-full rounded-lg bg-black object-cover" />{remoteStreams.slice(0, 3).map((r) => <RemoteVideo key={r.id} stream={r.stream} />)}</div>
      <div className="mt-3 flex gap-2">
        {!joined ? <button onClick={() => void startCall()} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Phone size={13} className="mr-1 inline" /> Join</button> : <button onClick={endCall} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"><PhoneOff size={13} className="mr-1 inline" /> End</button>}
        <button onClick={toggleMic} disabled={!joined} className="rounded-lg border border-slate-700 px-2 text-slate-200">{mic ? <Mic size={14} /> : <MicOff size={14} />}</button>
        <button onClick={() => setCamera((v) => !v)} disabled={joined} className="rounded-lg border border-slate-700 px-2 text-slate-200">{camera ? <Video size={14} /> : <VideoOff size={14} />}</button>
      </div>
      <div className="mt-3 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/70 p-2">{chat.length ? chat.map((m, i) => <p key={i} className="text-[10px] text-slate-300"><b className="text-cyan-300">{m.from}:</b> {m.text}</p>) : <p className="text-[10px] text-slate-600">Room messages appear here.</p>}</div>
      <div className="mt-2 flex gap-2"><input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Message doctor or staff…" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white" /><button disabled={!joined} onClick={sendChat} className="rounded-lg bg-cyan-600 px-3 text-white disabled:opacity-40"><Send size={13} /></button></div>
    </div>}
  </div>;
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline className="h-24 w-full rounded-lg bg-black object-cover" />;
}
