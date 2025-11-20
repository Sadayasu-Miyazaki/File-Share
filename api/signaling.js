// api/signaling.js

// ルームごとの状態をメモリに保存
// 同じVercelインスタンス内では継続利用されることが多いが、
// インスタンスが増えたりリセットされると消える可能性はある想定。
const rooms = new Map();

/**
 * room = {
 *   hostJoined: boolean,
 *   guestJoined: boolean,
 *   hostQueue: { payload: any }[],
 *   guestQueue: { payload: any }[]
 * }
 */

function getOrCreateRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = {
      hostJoined: false,
      guestJoined: false,
      hostQueue: [],
      guestQueue: []
    };
    rooms.set(code, room);
  }
  return room;
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { action, roomCode, role, payload } = req.body || {};
  if (!roomCode || !role) {
    res.status(400).json({ error: "roomCode and role are required" });
    return;
  }
  if (role !== "host" && role !== "guest") {
    res.status(400).json({ error: "role must be 'host' or 'guest'" });
    return;
  }

  const room = getOrCreateRoom(roomCode);

  if (action === "join") {
    if (role === "host") {
      room.hostJoined = true;
    } else {
      room.guestJoined = true;
    }

    // 両方 join したら ready を両者にキュー
    if (room.hostJoined && room.guestJoined) {
      room.hostQueue.push({ payload: { type: "ready" } });
      room.guestQueue.push({ payload: { type: "ready" } });
    }

    res.status(200).json({ ok: true });
    return;
  }

  if (action === "send") {
    if (!payload) {
      res.status(400).json({ error: "payload is required for send" });
      return;
    }

    const targetQueue = role === "host" ? room.guestQueue : room.hostQueue;
    targetQueue.push({ payload });

    res.status(200).json({ ok: true });
    return;
  }

  if (action === "recv") {
    const selfQueue = role === "host" ? room.hostQueue : room.guestQueue;
    const messages = selfQueue.splice(0, selfQueue.length); // キューを空にして返す
    res.status(200).json({ ok: true, messages });
    return;
  }

  if (action === "leave") {
    if (role === "host") {
      room.hostJoined = false;
    } else {
      room.guestJoined = false;
    }

    // 相手に peer-left を投げる
    const targetQueue = role === "host" ? room.guestQueue : room.hostQueue;
    targetQueue.push({ payload: { type: "peer-left" } });

    // 誰もいなければ部屋削除
    if (!room.hostJoined && !room.guestJoined) {
      rooms.delete(roomCode);
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: "Unknown action" });
}
