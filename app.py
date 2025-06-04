from flask import Flask, request, jsonify, render_template, send_file, Response
import os
import time
import json
import shutil
import logging
from werkzeug.utils import secure_filename
from flask_socketio import SocketIO, emit

# Import your existing classes
from fb_uploader import FacebookAdImageManager, FacebookAdVideoManager

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")
app.config['UPLOAD_FOLDER'] = 'temp_uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload

# Store upload tasks by session ID
upload_tasks = {}

# Ensure temp directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_media():
    # Get form data
    access_token = request.form.get('access_token')
    ad_account_id = request.form.get('ad_account_id')
    action = request.form.get('action')
    get_thumbnails = request.form.get('get_thumbnails') == 'true'
    thumbnail_wait_time = int(request.form.get('thumbnail_wait_time', 10))
    max_retries = int(request.form.get('max_retries', 3))
    retry_delay = float(request.form.get('retry_delay', 2.0))
    
    # Get uploaded files
    uploaded_files = request.files.getlist('files')
    
    if not uploaded_files:
        return jsonify({'error': 'No files uploaded'}), 400
    
    # Create a unique session folder
    session_id = str(int(time.time()))
    logger.debug(f"Created session ID: {session_id}")
    session_folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    logger.debug(f"Session folder path: {session_folder}")
    os.makedirs(session_folder, exist_ok=True)
    
    # Save files temporarily
    file_paths = []
    for file in uploaded_files:
        if file.filename:
            filename = secure_filename(file.filename)
            file_path = os.path.join(session_folder, filename)
            file.save(file_path)
            file_paths.append(file_path)
    
    # Initialize managers
    image_manager = FacebookAdImageManager(access_token, ad_account_id)
    video_manager = FacebookAdVideoManager(access_token, ad_account_id)
    
    results = []
    
    # Process files based on action and file types
    if action in ['upload_images', 'all']:
        # Filter for image files
        image_types = ['.jpg', '.jpeg', '.png', '.gif']
        image_files = [f for f in file_paths if os.path.splitext(f)[1].lower() in image_types]
        
        if image_files:
            # Create a temporary directory for images
            image_folder = os.path.join(session_folder, 'images')
            os.makedirs(image_folder, exist_ok=True)
            
            # Copy images to the image folder
            for img_path in image_files:
                shutil.copy(img_path, image_folder)
            
            # Upload images
            image_results = image_manager.upload_folder(
                image_folder,
                image_types,
                max_retries=max_retries,
                initial_retry_delay=retry_delay
            )
            
            # Process results
            for result in image_results:
                results.append({
                    'name': result['name'],
                    'hash': result.get('hash', ''),
                    'type': 'image',
                    'status': result.get('status', ''),
                    'attempts': result.get('attempts', 1)
                })
    
    if action in ['upload_videos', 'all']:
        # Filter for video files
        video_types = ['.mp4', '.mov', '.avi', '.wmv']
        video_files = [f for f in file_paths if os.path.splitext(f)[1].lower() in video_types]
        
        if video_files:
            # Create a temporary directory for videos
            video_folder = os.path.join(session_folder, 'videos')
            os.makedirs(video_folder, exist_ok=True)
            
            # Copy videos to the video folder
            for vid_path in video_files:
                shutil.copy(vid_path, video_folder)
            
            # Upload videos
            video_results = video_manager.upload_folder(
                video_folder,
                video_types,
                max_retries=max_retries,
                initial_retry_delay=retry_delay,
                get_thumbnails=get_thumbnails,
                thumbnail_wait_time=thumbnail_wait_time
            )
            
            # Add results
            results.extend(video_results)
    
    # Save results to a JSON file
    results_file = os.path.join(session_folder, 'results.json')
    logger.debug(f"Saving results to: {results_file}")
    with open(results_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    # Clean up the session folder (except results file)
    for root, dirs, files in os.walk(session_folder, topdown=False):
        for name in files:
            if name != 'results.json':
                os.remove(os.path.join(root, name))
        for name in dirs:
            os.rmdir(os.path.join(root, name))
    
    # Return results with session_id
    return jsonify({
        'session_id': session_id,
        'results': results
    })

@app.route('/download/<session_id>', methods=['GET'])
def download_results(session_id):
    logger.debug(f"Download requested for session: {session_id}")
    results_file = os.path.join(app.config['UPLOAD_FOLDER'], session_id, 'results.json')
    logger.debug(f"Looking for results at: {results_file}")
    
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        logger.error(f"Upload folder not found: {app.config['UPLOAD_FOLDER']}")
        return jsonify({'error': 'Upload folder not found'}), 404
        
    if not os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], session_id)):
        logger.error(f"Session folder not found: {session_id}")
        return jsonify({'error': f'Session folder not found: {session_id}'}), 404
        
    if not os.path.exists(results_file):
        logger.error(f"Results file not found in session: {session_id}")
        return jsonify({'error': f'Results file not found in session: {session_id}'}), 404
    
    logger.debug(f"Sending file: {results_file}")
    return send_file(results_file, as_attachment=True, download_name='ad_media_results.json')

@app.route('/download/<session_id>/csv', methods=['GET'])
def download_results_csv(session_id):
    logger.debug(f"CSV download requested for session: {session_id}")
    results_file = os.path.join(app.config['UPLOAD_FOLDER'], session_id, 'results.json')
    logger.debug(f"Looking for results at: {results_file}")
    
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        logger.error(f"Upload folder not found: {app.config['UPLOAD_FOLDER']}")
        return jsonify({'error': 'Upload folder not found'}), 404
        
    if not os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], session_id)):
        logger.error(f"Session folder not found: {session_id}")
        return jsonify({'error': f'Session folder not found: {session_id}'}), 404
        
    if not os.path.exists(results_file):
        logger.error(f"Results file not found in session: {session_id}")
        return jsonify({'error': f'Results file not found in session: {session_id}'}), 404
    
    # Read the JSON data
    try:
        with open(results_file, 'r') as f:
            results = json.load(f)
        
        # Create a CSV file in memory
        import csv
        from io import StringIO
        
        output = StringIO()
        fieldnames = ['name', 'type', 'status', 'hash', 'id', 'thumbnail_hash', 'attempts']
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for result in results:
            # Prepare row data, ensuring all fields exist
            row = {
                'name': result.get('name', ''),
                'type': result.get('type', ''),
                'status': result.get('status', ''),
                'hash': result.get('hash', ''),
                'id': result.get('id', ''),
                'thumbnail_hash': result.get('thumbnail_hash', ''),
                'attempts': result.get('attempts', 1)
            }
            writer.writerow(row)
        
        # Create response
        output.seek(0)
        logger.debug("CSV file created successfully")
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": "attachment; filename=ad_media_results.csv"}
        )
    except Exception as e:
        logger.error(f"Error creating CSV: {str(e)}")
        return jsonify({'error': f'Error creating CSV: {str(e)}'}), 500

# New routes for individual file uploads and pause/resume functionality
@app.route('/upload-file', methods=['POST'])
def upload_single_file():
    # Get file and parameters
    file = request.files.get('file')
    access_token = request.form.get('access_token')
    ad_account_id = request.form.get('ad_account_id')
    file_index = request.form.get('file_index')
    get_thumbnails = request.form.get('get_thumbnails') == 'true'
    
    if not file:
        return jsonify({'error': 'No file uploaded'}), 400
    
    # Process file based on type
    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    
    # Create temp folder
    temp_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'temp_' + str(time.time()))
    os.makedirs(temp_folder, exist_ok=True)
    
    # Save file
    file_path = os.path.join(temp_folder, filename)
    file.save(file_path)
    
    # Initialize managers
    image_manager = FacebookAdImageManager(access_token, ad_account_id)
    video_manager = FacebookAdVideoManager(access_token, ad_account_id)
    
    result = None
    
    try:
        # Process based on file type
        if ext in ['.jpg', '.jpeg', '.png', '.gif']:
            result = image_manager.upload_image(file_path)
            result['type'] = 'image'
        elif ext in ['.mp4', '.mov', '.avi', '.wmv']:
            result = video_manager.upload_video(file_path, get_thumbnail=get_thumbnails)
            result['type'] = 'video'
        else:
            result = {
                'name': filename,
                'status': 'failed',
                'error': 'Unsupported file type'
            }
    except Exception as e:
        result = {
            'name': filename,
            'status': 'failed',
            'error': str(e)
        }
    finally:
        # Clean up
        try:
            shutil.rmtree(temp_folder)
        except:
            logger.error(f"Failed to clean up temp folder: {temp_folder}")
    
    return jsonify(result)

@app.route('/create-upload-session', methods=['POST'])
def create_upload_session():
    session_id = str(int(time.time()))
    upload_tasks[session_id] = {
        'status': 'created',
        'files': [],
        'current_index': 0,
        'completed': [],
        'total_files': 0
    }
    return jsonify({'session_id': session_id})

@app.route('/upload-batch/<session_id>', methods=['POST'])
def upload_batch(session_id):
    if session_id not in upload_tasks:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    # Get file info
    access_token = request.form.get('access_token')
    ad_account_id = request.form.get('ad_account_id')
    
    # Get uploaded files
    files = request.files.getlist('files')
    
    # Save session info
    task = upload_tasks[session_id]
    task['access_token'] = access_token
    task['ad_account_id'] = ad_account_id
    task['status'] = 'ready'
    task['total_files'] = len(files)
    
    # Create session folder
    session_folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    # Save files temporarily 
    file_paths = []
    for i, file in enumerate(files):
        if file.filename:
            filename = secure_filename(file.filename)
            file_path = os.path.join(session_folder, filename)
            file.save(file_path)
            
            task['files'].append({
                'index': i,
                'name': filename,
                'path': file_path,
                'status': 'pending'
            })
    
    return jsonify({
        'session_id': session_id,
        'total_files': len(task['files']),
        'status': task['status']
    })

@app.route('/start-upload/<session_id>', methods=['POST'])
def start_upload(session_id):
    if session_id not in upload_tasks:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    task = upload_tasks[session_id]
    task['status'] = 'uploading'
    
    return jsonify({
        'status': 'uploading',
        'current_index': task['current_index'],
        'total_files': task['total_files']
    })

@app.route('/upload-next/<session_id>', methods=['POST'])
def upload_next(session_id):
    if session_id not in upload_tasks:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    task = upload_tasks[session_id]
    
    if task['status'] == 'paused':
        return jsonify({'status': 'paused'})
    
    if task['status'] == 'cancelled':
        return jsonify({'status': 'cancelled'})
    
    if task['current_index'] >= len(task['files']):
        task['status'] = 'completed'
        return jsonify({'status': 'completed'})
    
    # Get current file to process
    file_info = task['files'][task['current_index']]
    file_path = file_info['path']
    
    # Process file based on type
    ext = os.path.splitext(file_path)[1].lower()
    
    # Initialize managers
    image_manager = FacebookAdImageManager(task['access_token'], task['ad_account_id'])
    video_manager = FacebookAdVideoManager(task['access_token'], task['ad_account_id'])
    
    result = None
    
    try:
        # Process based on file type
        if ext in ['.jpg', '.jpeg', '.png', '.gif']:
            result = image_manager.upload_image(file_path)
            result['type'] = 'image'
        elif ext in ['.mp4', '.mov', '.avi', '.wmv']:
            result = video_manager.upload_video(file_path)
            result['type'] = 'video'
        else:
            result = {
                'name': os.path.basename(file_path),
                'status': 'failed',
                'error': 'Unsupported file type',
                'type': 'unknown'
            }
        
        # Update file status
        file_info['status'] = 'processed' if result['status'] == 'success' else 'failed'
        file_info['result'] = result
        
        task['current_index'] += 1
        task['completed'].append(result)
        
        return jsonify({
            'status': 'success',
            'result': result,
            'current_index': task['current_index'],
            'total_files': task['total_files']
        })
    
    except Exception as e:
        file_info['status'] = 'error'
        file_info['error'] = str(e)
        
        task['current_index'] += 1
        
        error_result = {
            'name': os.path.basename(file_path),
            'status': 'failed',
            'error': str(e),
            'type': 'image' if ext in ['.jpg', '.jpeg', '.png', '.gif'] else 'video' if ext in ['.mp4', '.mov', '.avi', '.wmv'] else 'unknown'
        }
        
        task['completed'].append(error_result)
        
        return jsonify({
            'status': 'error',
            'error': str(e),
            'result': error_result,
            'current_index': task['current_index'],
            'total_files': task['total_files']
        })

@app.route('/pause-upload/<session_id>', methods=['POST'])
def pause_upload(session_id):
    if session_id not in upload_tasks:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    task = upload_tasks[session_id]
    task['status'] = 'paused'
    
    return jsonify({'status': 'paused'})

@app.route('/resume-upload/<session_id>', methods=['POST'])
def resume_upload(session_id):
    if session_id not in upload_tasks:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    task = upload_tasks[session_id]
    task['status'] = 'uploading'
    
    return jsonify({'status': 'uploading'})

@app.route('/cancel-upload/<session_id>', methods=['POST'])
def cancel_upload(session_id):
    if session_id not in upload_tasks:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    task = upload_tasks[session_id]
    task['status'] = 'cancelled'
    
    return jsonify({'status': 'cancelled'})

@socketio.on('upload_progress')
def handle_progress(data):
    emit('progress_update', data, broadcast=False)

if __name__ == "__main__":
    # For local development
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)
