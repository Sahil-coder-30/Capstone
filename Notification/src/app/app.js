import express from "express";
import morgan from "morgan";
import channel from "../config/mq.js";
import { sendEmail } from "../services/email.js";
import buildAuthEmail from "../emails/template/authNotification.js";

const app = express();
app.use(morgan("dev"));

app.get("/readyz", (req, res) => {
  res.status(200).json({
    message: "Notification serviece is ready....",
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({
    message: "Notification serviece is healthy....",
  });
});

channel.consume('auth_notification_queue', async (msg) => {
  // null check FIRST — msg.content throws if msg is null
  if (msg === null) {
    console.log('consumer cancelled by broker');
    return;
  }

  console.log('message received from auth_notification_queue');

  try {
    const { username, email, userId, timestamps, action } = JSON.parse(
      msg.content.toString()
    );

    const { subject, html, text } = buildAuthEmail({
      username,
      email,
      userId,
      timestamps,
      action,
    });

    await sendEmail({ to: email, subject, text, html });
    channel.ack(msg);
    console.log(`auth email sent → ${action} · ${email}`);
  } catch (err) {
    console.error('auth_notification_queue error:', err.message);
    // false = don't requeue malformed messages → dead-letter queue
    channel.nack(msg, false, false);
  }
});

export default app;
