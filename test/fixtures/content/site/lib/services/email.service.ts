export function videoReadyEmail(name: string) {
  return {
    subject: "Your video is ready",
    html: `<p>Hi ${name},</p><p>Your translation is done. Find it in My videos and share it with your team.</p>`,
  };
}
