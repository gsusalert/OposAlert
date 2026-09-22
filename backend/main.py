BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

def send_alert_async(recipient_email: str, recipient_tg: str, page_name: str, page_url: str):
    """Envía la alerta por Brevo API HTTP (a cualquier correo) y Telegram."""
    def _worker():
        # 1. Envío por Email a CUALQUIER usuario con Brevo API
        if BREVO_API_KEY and recipient_email.strip():
            try:
                payload = {
                    "sender": {"name": "OposAlert", "email": SENDER_EMAIL},
                    "to": [{"email": recipient_email.strip()}],
                    "subject": f"🔔 [OposAlert] ¡Novedad en: {page_name}!",
                    "htmlContent": f"""
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e5e7eb; border-radius: 8px;">
                            <h2 style="color: #7c3aed; margin-top: 0;">¡Novedad detectada en OposAlert!</h2>
                            <p>Se ha detectado una modificación en la página que vigilas:</p>
                            <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 15px 0;">
                                <p style="margin: 0 0 8px 0;"><b>Página:</b> {page_name}</p>
                                <p style="margin: 0;"><b>Enlace:</b> <a href="{page_url}">{page_url}</a></p>
                            </div>
                            <div style="margin: 25px 0;">
                                <a href="{page_url}" target="_blank" style="background-color: #7c3aed; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                                    👉 Pulsar aquí para ir a la página
                                </a>
                            </div>
                            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Fecha del aviso: {time.strftime('%d/%m/%Y a las %H:%M')}</p>
                        </div>
                    """
                }
                res = requests.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={
                        "api-key": BREVO_API_KEY,
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    json=payload,
                    timeout=8
                )
                if res.status_code in [200, 201, 202]:
                    print(f"[OK EMAIL BREVO] Enviado correctamente a {recipient_email}")
                else:
                    print(f"[ERROR BREVO] Código {res.status_code}: {res.text}")
            except Exception as e:
                print(f"[ERROR BREVO EXCEPTION]: {e}")

        # 2. Envío por Telegram (si el usuario puso su Chat ID)
        if TELEGRAM_BOT_TOKEN and recipient_tg.strip():
            try:
                tg_msg = (
                    f"🔔 *¡Novedad detectada en OposAlert!*\n\n"
                    f"📌 *Página:* {page_name}\n\n"
                    f"👉 [Pulsa aquí para abrir la web]({page_url})"
                )
                tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
                requests.post(tg_url, json={
                    "chat_id": recipient_tg.strip(),
                    "text": tg_msg,
                    "parse_mode": "Markdown"
                }, timeout=5)
                print(f"[OK TG] Enviado a Telegram Chat ID: {recipient_tg}")
            except Exception as e:
                print(f"[ERROR TG]: {e}")

    threading.Thread(target=_worker, daemon=True).start()