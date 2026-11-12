// In-memory stand-ins for the chat models, so tests need no database.

import mongoose from "mongoose";

/** Replaces a Session model's methods with an in-memory list. */
export function stubSessions(Session) {
  const sessions = [];
  const matches = (s, filter) =>
    (!filter._id || String(s._id) === String(filter._id)) &&
    s.userId === filter.userId &&
    (!filter.projectId || s.projectId === filter.projectId) &&
    (!filter.deletionStatus || s.deletionStatus === filter.deletionStatus);

  Session.create = async (doc) => {
    const session = { _id: new mongoose.Types.ObjectId(), title: "New chat", deletionStatus: "active", lastMessageAt: new Date(), ...doc };
    sessions.push(session);
    return session;
  };
  Session.findOne = async (filter) => sessions.find((s) => matches(s, filter)) || null;
  Session.find = (filter) => {
    const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: async () => sessions.filter((s) => matches(s, filter)) };
    return chain;
  };
  Session.updateOne = async () => ({ modifiedCount: 1 });
  return sessions;
}

/** A Memory model with no notes yet; records writes. */
export function stubMemory(Memory, Message) {
  const writes = [];
  Memory.findOne = async () => null;
  Memory.updateOne = async (...args) => writes.push(args);
  if (Message) Message.countDocuments = async () => 0;
  return writes;
}

/** A Message.find stub: find().sort().limit().select().lean() returns rows(filter). */
export const findChain = (rows) => (filter) => {
  const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: async () => rows(filter) };
  return chain;
};
