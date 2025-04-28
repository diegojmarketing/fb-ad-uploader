# fb_uploader.py
import os
import requests
import json
import base64
import time
import random
from typing import Dict, List, Optional, Tuple

class FacebookAdImageManager:
    def __init__(self, access_token: str, ad_account_id: str):
        """
        Initialize the Facebook Ad Image Manager.
        
        Args:
            access_token: Facebook Access Token with ads management permissions
            ad_account_id: ID of the Facebook Ad Account (format: act_XXXXXXXXXX)
        """
        self.access_token = access_token
        # Ensure ad_account_id starts with 'act_'
        self.ad_account_id = ad_account_id if ad_account_id.startswith('act_') else f'act_{ad_account_id}'
        self.api_version = "v19.0"
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        
    def upload_image(self, image_path: str, name: Optional[str] = None, max_retries: int = 3, 
                    initial_retry_delay: float = 2.0) -> Dict:
        """
        Upload an image to Facebook Ad Account and return the response including image hash.
        Includes retry logic for failed uploads.
        
        Args:
            image_path: Path to the image file
            name: Optional name for the image
            max_retries: Maximum number of retry attempts (default: 3)
            initial_retry_delay: Initial delay between retries in seconds (default: 2.0)
            
        Returns:
            Dict containing the API response with image hash and other details
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")
            
        # Set image name if provided, otherwise use the filename
        image_name = name if name else os.path.basename(image_path)
        
        # Read and encode the image once to avoid repeated file operations
        with open(image_path, 'rb') as image_file:
            image_data = image_file.read()
            encoded_image = base64.b64encode(image_data).decode('utf-8')
        
        # Endpoint for ad image upload
        endpoint = f"{self.base_url}/{self.ad_account_id}/adimages"
        
        # Prepare the payload
        payload = {
            'access_token': self.access_token,
            'bytes': encoded_image,
            'name': image_name
        }
        
        # Retry logic
        attempt = 0
        retry_delay = initial_retry_delay
        last_error = None
        
        while attempt <= max_retries:
            attempt += 1
            try:
                # Make the POST request
                response = requests.post(endpoint, data=payload, timeout=30)
                
                # Check if the request was successful
                if response.status_code == 200:
                    result = response.json()
                    
                    # Extract hash from the response
                    image_hash = None
                    if 'images' in result and image_name in result['images']:
                        image_data = result['images'][image_name]
                        if 'hash' in image_data:
                            image_hash = image_data['hash']
                    
                    return {
                        'name': image_name,
                        'hash': image_hash,
                        'status': 'success',
                        'attempts': attempt,
                        'full_response': result
                    }
                
                # Some error occurred
                last_error = f"HTTP {response.status_code}: {response.text}"
                
                # Check if the error is retryable (avoid retrying permission errors, invalid tokens, etc.)
                if response.status_code in [400, 401, 403, 405, 410]:
                    # These are likely permanent errors, so don't retry
                    break
                
            except (requests.RequestException, ConnectionError, TimeoutError) as e:
                # Network errors are usually temporary and worth retrying
                last_error = str(e)
            
            # If this was the last retry attempt, break out of the loop
            if attempt > max_retries:
                break
                
            # Log retry attempt
            print(f"Upload attempt {attempt} for {image_name} failed. Retrying in {retry_delay:.1f} seconds...")
            
            # Wait before retrying with a small random factor to avoid thundering herd problem
            jitter = random.uniform(0.8, 1.2)
            time.sleep(retry_delay * jitter)
            
            # Exponential backoff for subsequent retries
            retry_delay = min(retry_delay * 2, 60)  # Cap at 60 seconds
        
        # If we get here, all retry attempts failed
        print(f"Failed to upload {image_name} after {attempt} attempts. Last error: {last_error}")
        return {
            'name': image_name,
            'status': 'failed', 
            'error': last_error,
            'attempts': attempt
        }
        
    def upload_folder(self, folder_path: str, file_types: List[str] = None, max_retries: int = 3, 
                      initial_retry_delay: float = 2.0) -> List[Dict]:
        """
        Upload all images from a folder to Facebook Ad Account.
        
        Args:
            folder_path: Path to the folder containing images
            file_types: List of file extensions to include (e.g., ['.jpg', '.png'])
            max_retries: Maximum number of retry attempts per image
            initial_retry_delay: Initial delay between retries in seconds
            
        Returns:
            List of dicts containing upload results with image hashes
        """
        if not os.path.isdir(folder_path):
            raise NotADirectoryError(f"Folder not found: {folder_path}")
            
        # Default file types if none provided
        if file_types is None:
            file_types = ['.jpg', '.jpeg', '.png', '.gif']
        
        # Convert file types to lowercase for case-insensitive comparison
        file_types = [ft.lower() for ft in file_types]
        
        # Get all image files in the folder
        image_files = []
        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            if os.path.isfile(file_path):
                ext = os.path.splitext(filename)[1].lower()
                if ext in file_types:
                    image_files.append(file_path)
        
        # Upload each image
        results = []
        total_success = 0
        total_failed = 0
        total_retries = 0
        
        for i, image_path in enumerate(image_files):
            print(f"Uploading {i+1}/{len(image_files)}: {os.path.basename(image_path)}...")
            
            result = self.upload_image(
                image_path, 
                max_retries=max_retries, 
                initial_retry_delay=initial_retry_delay
            )
            
            results.append(result)
            
            # Update stats
            if result['status'] == 'success':
                total_success += 1
                total_retries += result.get('attempts', 1) - 1  # Subtract first attempt
            else:
                total_failed += 1
                total_retries += result.get('attempts', 1) - 1  # Subtract first attempt
            
            # Add a small delay to avoid rate limits, slightly longer after retries
            time.sleep(1.5 if result.get('attempts', 1) > 1 else 1.0)
        
        # Print summary
        print(f"\nUpload Summary:")
        print(f"  Total images: {len(image_files)}")
        print(f"  Successful: {total_success}")
        print(f"  Failed: {total_failed}")
        print(f"  Total retry attempts: {total_retries}")
        
        return results
        
    def get_ad_images(self, limit: int = 100) -> List[Dict]:
        """
        Retrieve images and their hashes from the Facebook Ad Account.
        
        Args:
            limit: Maximum number of images to retrieve (default: 100)
            
        Returns:
            List of dicts containing image name and hash information
        """
        # Endpoint for retrieving ad images
        endpoint = f"{self.base_url}/{self.ad_account_id}/adimages"
        
        params = {
            'access_token': self.access_token,
            'fields': 'id,name,hash,url,status',
            'limit': limit
        }
        
        # Make the GET request
        response = requests.get(endpoint, params=params)
        
        # Check if the request was successful
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            print(response.text)
            return []
            
        result = response.json()
        
        # Extract images from the response
        images = []
        if 'data' in result:
            images = result['data']
            
        # Handle pagination if needed
        while 'paging' in result and 'next' in result['paging'] and len(images) < limit:
            response = requests.get(result['paging']['next'])
            if response.status_code != 200:
                break
                
            result = response.json()
            if 'data' in result:
                images.extend(result['data'])
        
        return images[:limit]
    
    def save_results_to_json(self, data: List[Dict], output_file: str) -> None:
        """
        Save image data to a JSON file.
        
        Args:
            data: List of image data to save
            output_file: Path to the output JSON file
        """
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"Data saved to {output_file}")
        
    def save_results_to_csv(self, data: List[Dict], output_file: str) -> None:
        """
        Save image data to a CSV file.
        
        Args:
            data: List of image data to save
            output_file: Path to the output CSV file
        """
        import csv
        
        # Define the CSV fields for both image and video data
        fields = ['name', 'type', 'hash', 'id', 'thumbnail_hash', 'status', 'attempts']
        
        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            for item in data:
                row = {
                    'name': item['name'],
                    'type': item.get('type', 'image'),  # Default to 'image' for backward compatibility
                    'hash': item.get('hash', ''),
                    'id': item.get('id', ''),
                    'thumbnail_hash': item.get('thumbnail_hash', ''),
                    'status': item.get('status', ''),
                    'attempts': item.get('attempts', 1)
                }
                writer.writerow(row)
        
        print(f"Data saved to {output_file}")

class FacebookAdVideoManager:
    def __init__(self, access_token: str, ad_account_id: str):
        """
        Initialize the Facebook Ad Video Manager.
        
        Args:
            access_token: Facebook Access Token with ads management permissions
            ad_account_id: ID of the Facebook Ad Account (format: act_XXXXXXXXXX)
        """
        self.access_token = access_token
        # Ensure ad_account_id starts with 'act_'
        self.ad_account_id = ad_account_id if ad_account_id.startswith('act_') else f'act_{ad_account_id}'
        self.api_version = "v19.0"
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        
    def upload_video(self, video_path: str, name: Optional[str] = None, max_retries: int = 3, 
                    initial_retry_delay: float = 2.0, get_thumbnail: bool = True,
                    thumbnail_wait_time: int = 10) -> Dict:
        """
        Upload a video to Facebook Ad Account and return the response.
        Optionally retrieves the thumbnail hash after upload.
        
        Args:
            video_path: Path to the video file
            name: Optional name for the video
            max_retries: Maximum number of retry attempts
            initial_retry_delay: Initial delay between retries in seconds
            get_thumbnail: Whether to retrieve the thumbnail hash after upload
            thumbnail_wait_time: Time to wait for thumbnail generation in seconds
            
        Returns:
            Dict containing the API response with video ID, thumbnail hash, and other details
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
            
        # Set video name if provided, otherwise use the filename
        video_name = name if name else os.path.basename(video_path)
        
        # Endpoint for ad video upload
        endpoint = f"{self.base_url}/{self.ad_account_id}/advideos"
        
        # Prepare the headers and files
        headers = {
            'Accept': 'application/json',
        }
        
        # Retry logic
        attempt = 0
        retry_delay = initial_retry_delay
        last_error = None
        
        while attempt <= max_retries:
            attempt += 1
            try:
                # For videos, we use multipart form upload rather than base64 encoding
                # Open the file inside the loop to ensure it's freshly opened for each attempt
                files = {
                    'source': (video_name, open(video_path, 'rb'), 'video/mp4'),
                }
                
                data = {
                    'access_token': self.access_token,
                    'name': video_name
                }
                
                # Make the POST request with multipart form data
                response = requests.post(endpoint, headers=headers, data=data, files=files, timeout=120)
                
                # Ensure file is closed after request
                files['source'][1].close()
                
                # Check if the request was successful
                if response.status_code == 200:
                    result = response.json()
                    video_id = result.get('id')
                    
                    # Prepare the result data
                    upload_result = {
                        'name': video_name,
                        'id': video_id,
                        'status': 'success',
                        'attempts': attempt,
                        'full_response': result
                    }
                    
                    # Optionally get the thumbnail hash
                    if get_thumbnail and video_id:
                        print(f"Video uploaded successfully. Waiting {thumbnail_wait_time} seconds for thumbnail generation...")
                        time.sleep(thumbnail_wait_time)
                        
                        print(f"Retrieving thumbnail hash for video {video_name}...")
                        thumbnail_data = self.get_video_thumbnail(video_id)
                        
                        if thumbnail_data:
                            upload_result['thumbnail_hash'] = thumbnail_data.get('hash')
                            upload_result['thumbnail_id'] = thumbnail_data.get('id')
                            upload_result['thumbnail_url'] = thumbnail_data.get('url')
                            print(f"Successfully retrieved thumbnail hash: {thumbnail_data.get('hash')}")
                        else:
                            upload_result['thumbnail_status'] = 'not_available'
                            print(f"No thumbnail available yet for video {video_name}")
                    
                    return upload_result
                
                # Some error occurred
                last_error = f"HTTP {response.status_code}: {response.text}"
                
                # Check if the error is retryable
                if response.status_code in [400, 401, 403, 405, 410]:
                    break
                
            except (requests.RequestException, ConnectionError, TimeoutError) as e:
                # Network errors are usually temporary and worth retrying
                last_error = str(e)
                # Make sure to close file handles if an exception occurs
                if 'files' in locals() and 'source' in files:
                    try:
                        files['source'][1].close()
                    except:
                        pass
            
            # If this was the last retry attempt, break out of the loop
            if attempt > max_retries:
                break
                
            # Log retry attempt
            print(f"Upload attempt {attempt} for {video_name} failed. Retrying in {retry_delay:.1f} seconds...")
            
            # Wait before retrying with a small random factor
            jitter = random.uniform(0.8, 1.2)
            time.sleep(retry_delay * jitter)
            
            # Exponential backoff for subsequent retries
            retry_delay = min(retry_delay * 2, 60)  # Cap at 60 seconds
        
        # If we get here, all retry attempts failed
        print(f"Failed to upload {video_name} after {attempt} attempts. Last error: {last_error}")
        return {
            'name': video_name,
            'status': 'failed', 
            'error': last_error,
            'attempts': attempt
        }
    
    def get_video_thumbnail(self, video_id: str) -> Optional[Dict]:
        """
        Get thumbnail data for a specific video.
        
        Args:
            video_id: The ID of the video
            
        Returns:
            Dict containing thumbnail hash and URL, or None if no thumbnail exists
        """
        # Endpoint for retrieving video thumbnails
        endpoint = f"{self.base_url}/{video_id}"
        
        params = {
            'access_token': self.access_token,
            'fields': 'thumbnails{id,name,uri,hash,url}'
        }
        
        # Make the GET request
        response = requests.get(endpoint, params=params)
        
        # Check if the request was successful
        if response.status_code != 200:
            print(f"Error retrieving thumbnails for video {video_id}: {response.status_code}")
            return None
            
        result = response.json()
        
        # Extract thumbnail data from the response
        if 'thumbnails' in result and 'data' in result['thumbnails'] and result['thumbnails']['data']:
            # Usually the first thumbnail is the default one
            return result['thumbnails']['data'][0]
        
        return None
        
    def upload_folder(self, folder_path: str, file_types: List[str] = None, max_retries: int = 3, 
                      initial_retry_delay: float = 2.0, get_thumbnails: bool = True,
                      thumbnail_wait_time: int = 10) -> List[Dict]:
        """
        Upload all videos from a folder to Facebook Ad Account.
        
        Args:
            folder_path: Path to the folder containing videos
            file_types: List of file extensions to include (e.g., ['.mp4', '.mov'])
            max_retries: Maximum number of retry attempts per video
            initial_retry_delay: Initial delay between retries in seconds
            get_thumbnails: Whether to retrieve the thumbnail hash after upload
            thumbnail_wait_time: Time to wait for thumbnail generation in seconds
            
        Returns:
            List of dicts containing upload results
        """
        if not os.path.isdir(folder_path):
            raise NotADirectoryError(f"Folder not found: {folder_path}")
            
        # Default file types if none provided
        if file_types is None:
            file_types = ['.mp4', '.mov', '.avi', '.wmv']
        
        # Convert file types to lowercase for case-insensitive comparison
        file_types = [ft.lower() for ft in file_types]
        
        # Get all video files in the folder
        video_files = []
        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            if os.path.isfile(file_path):
                ext = os.path.splitext(filename)[1].lower()
                if ext in file_types:
                    video_files.append(file_path)
        
        # Upload each video
        results = []
        total_success = 0
        total_failed = 0
        total_retries = 0
        total_with_thumbnails = 0
        
        for i, video_path in enumerate(video_files):
            print(f"Uploading {i+1}/{len(video_files)}: {os.path.basename(video_path)}...")
            
            result = self.upload_video(
                video_path, 
                max_retries=max_retries, 
                initial_retry_delay=initial_retry_delay,
                get_thumbnail=get_thumbnails,
                thumbnail_wait_time=thumbnail_wait_time
            )
            
            # Add video type to the result
            result['type'] = 'video'
            results.append(result)
            
            # Update stats
            if result['status'] == 'success':
                total_success += 1
                total_retries += result.get('attempts', 1) - 1
                if 'thumbnail_hash' in result and result['thumbnail_hash']:
                    total_with_thumbnails += 1
            else:
                total_failed += 1
                total_retries += result.get('attempts', 1) - 1
            
            # Add a delay to avoid rate limits, longer delay for videos
            time.sleep(2.5 if result.get('attempts', 1) > 1 else 2.0)
        
        # Print summary
        print(f"\nUpload Summary:")
        print(f"  Total videos: {len(video_files)}")
        print(f"  Successful: {total_success}")
        print(f"  Failed: {total_failed}")
        print(f"  Videos with thumbnails: {total_with_thumbnails}")
        print(f"  Total retry attempts: {total_retries}")
        
        return results
        
    def get_ad_videos(self, limit: int = 100) -> List[Dict]:
        """
        Retrieve videos from the Facebook Ad Account.
        
        Args:
            limit: Maximum number of videos to retrieve (default: 100)
            
        Returns:
            List of dicts containing video information
        """
        # Endpoint for retrieving ad videos
        endpoint = f"{self.base_url}/{self.ad_account_id}/advideos"
        
        params = {
            'access_token': self.access_token,
            'fields': 'id,name,thumbnail_url,status',
            'limit': limit
        }
        
        # Make the GET request
        response = requests.get(endpoint, params=params)
        
        # Check if the request was successful
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            print(response.text)
            return []
            
        result = response.json()
        
        # Extract videos from the response
        videos = []
        if 'data' in result:
            videos = result['data']
            
        # Handle pagination if needed
        while 'paging' in result and 'next' in result['paging'] and len(videos) < limit:
            response = requests.get(result['paging']['next'])
            if response.status_code != 200:
                break
                
            result = response.json()
            if 'data' in result:
                videos.extend(result['data'])
        
        return videos[:limit]

