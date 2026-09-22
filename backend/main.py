RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

def send_alert_async(recipient: str, page_name: str, page_url: str):
    """Envía la alerta por Resend HTTP API (inmune a bloqueos SMTP de Render) y Telegram."""
    def _worker():
        # Envío de correo mediante API HTTP
        if RESEND_API_KEY:
            try:
                res = requests.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": "OposAlert <onboarding@resend.dev>",
                        "to": [recipient],
                        "subject": f"🔔 [OposAlert] ¡Novedad en: {page_name}!",
                        "html": f"""
                            <h2>¡Novedad detectada!</h2>
                            <p>Se ha detectado una modificación en la página que vigilas:</p>
                            <p><b>Web:</b> {page_name}</p>
                            <p><a href="{page_url}" style="background-color:#7c3aed;color:white;padding:10px 15px;text-decoration:none;border-radius:6px;display:inline-block;">Ir a la convocatoria</a></p>
                            <p><small>Fecha: {time.strftime('%d/%m/%Y a las %H:%M')}</small></p>
                        """
                    },
                    timeout=8
                )
                if res.status_code in [200, 201]:
                    print(f"[OK EMAIL] Alerta enviada con éxito a {recipient}")
                else:
                    print(f"[ERROR RESEND]: {res.status_code} - {res.text}")
            except Exception as e:
                print(f"[ERROR RESEND EXCEPTION]: {e}")
        else:
            print("[AVISO] Configura RESEND_API_KEY en Render para recibir emails.")

        # Envío por Telegram (si está configurado)
        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            try:
                tg_msg = f"🔔 *[OposAlert] Cambio detectado*\n\n📌 *Web:* {page_name}\n🔗 [Abrir enlace]({page_url})"
                tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
                requests.post(tg_url, json={"chat_id": TELEGRAM_CHAT_ID, "text": tg_msg, "parse_mode": "Markdown"}, timeout=5)
                print("[OK TG] Notificación enviada por Telegram")
            except Exception as e:
                print(f"[ERROR TG]: {e}")

    threading.Thread(target=_worker, daemon=True).start()