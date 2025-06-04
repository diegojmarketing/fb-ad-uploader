import os
from app import app, socketio

# Make the application work with Gunicorn
# This version properly handles the PORT environment variable
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port)
else:
    # For Gunicorn, expose the WSGI callable
    application = app
