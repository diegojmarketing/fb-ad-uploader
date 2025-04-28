from app import app, socketio

# This makes it work with Gunicorn
application = socketio.run(app)