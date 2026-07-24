import express from "express";
import morgan from "morgan";
import channel, { AUTH_QUEUE, PAYMENT_QUEUE } from "../config/mq.js";
import { sendEmail } from "../services/email.js";
import buildAuthEmail from "../emails/template/authNotification.js";
import buildPaymentEmail from "../emails/template/paymentNotification.js";

const app = express();
app.use(morgan("dev"));

app.get("/readyz", (req, res) => {
  res.status(200).json({
    message: "Notification service is ready....",
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({
    message: "Notification service is healthy....",
  });
});

// Auth notifications consumer
channel.consume(AUTH_QUEUE, async (msg) => {
  if (msg === null) {
    console.log('auth consumer cancelled by broker');
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
    channel.nack(msg, false, false);
  }
});

// Payment notifications consumer
channel.consume(PAYMENT_QUEUE, async (msg) => {
  if (msg === null) {
    console.log('payment consumer cancelled by broker');
    return;
  }

  console.log('message received from payment_notification_queue');

  try {
    const payload = JSON.parse(msg.content.toString());
    const { username, email, action, transactionDetails, items, invoiceNumber, timestamps } = payload;

    const { subject, html, text } = buildPaymentEmail({
      username,
      email,
      action,
      transactionDetails,
      items,
      invoiceNumber,
      timestamps,
    });

    await sendEmail({ to: email, subject, text, html });
    channel.ack(msg);
    console.log(`payment email sent → ${action} · ${email}`);
  } catch (err) {
    console.error('payment_notification_queue error:', err.message);
    channel.nack(msg, false, false);
  }
});

export default app;

