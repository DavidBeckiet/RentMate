function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return entities[character];
  });
}

export function createEmailContent(input) {
  if (input.eventType === "PASSWORD_RESET") {
    const safeSecret = escapeHtml(input.secret);
    return Object.freeze({
      subject: "Mã đặt lại mật khẩu RentMate",
      text: `RentMate\n\nMã đặt lại mật khẩu của bạn:\n\n${input.secret}\n\nKhông chia sẻ mã này với người khác.\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`,
      html: `<p>RentMate</p><p>Mã đặt lại mật khẩu của bạn:</p><p><strong>${safeSecret}</strong></p><p>Không chia sẻ mã này với người khác.</p><p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>`
    });
  }

  const safeSecret = escapeHtml(input.secret);
  return Object.freeze({
    subject: "Mã xác minh email RentMate",
    text: `RentMate\n\nMã xác minh email của bạn:\n\n${input.secret}\n\nKhông chia sẻ mã này với người khác.\nNếu bạn không yêu cầu xác minh, hãy bỏ qua email này.`,
    html: `<p>RentMate</p><p>Mã xác minh email của bạn:</p><p><strong>${safeSecret}</strong></p><p>Không chia sẻ mã này với người khác.</p><p>Nếu bạn không yêu cầu xác minh, hãy bỏ qua email này.</p>`
  });
}
