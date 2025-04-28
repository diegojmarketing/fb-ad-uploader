document.addEventListener('DOMContentLoaded', function() {
    // Socket.io connection
    const socket = io();
    
    // Form and UI elements
    const form = document.getElementById('upload-form');
    const progress = document.getElementById('progress');
    const progressFill = document.querySelector('#overall-progress .progress-fill');
    const progressText = document.getElementById('progress-text');
    const results = document.getElementById('results');
    const resultsContent = document.getElementById('results-content');
    const exportOptions = document.getElementById('export-options');
    const submitButton = document.getElementById('submit-button');
    const uploadControls = document.getElementById('upload-controls');
    const pauseButton = document.getElementById('pause-button');
    const resumeButton = document.getElementById('resume-button');
    const cancelButton = document.getElementById('cancel-button');
    
    // Drag and drop elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('files');
    const fileList = document.getElementById('file-list');
    const previewContainer = document.getElementById('preview-container');
    
    // Global variables for upload state
    let sessionId = '';
    let isPaused = false;
    let isCancelled = false;
    let accumulatedFiles = []; // Store files from multiple folder selections
    let availableTags = ['product', 'lifestyle', 'banner', 'promotion', 'seasonal']; // Default tags
    let activeTags = [];
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when file is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    
    // Handle file input change
    fileInput.addEventListener('change', handleFiles, false);
    
    // Add clear button
    const clearFilesButton = document.createElement('button');
    clearFilesButton.type = 'button';
    clearFilesButton.id = 'clear-files';
    clearFilesButton.className = 'clear-button';
    clearFilesButton.textContent = 'Clear All';
    clearFilesButton.addEventListener('click', function() {
        accumulatedFiles = [];
        updateFileList([]);
        previewContainer.innerHTML = '';
        fileInput.value = '';
    });
    
    // Add file action container
    const fileActions = document.createElement('div');
    fileActions.className = 'file-actions';
    
    // Move the label element
    const browseLabel = document.querySelector('label[for="files"].file-button');
    if (browseLabel) {
        fileActions.appendChild(browseLabel);
        fileActions.appendChild(clearFilesButton);
        
        // Add the file actions container after the drop area paragraph
        const dropAreaP = dropArea.querySelector('p');
        if (dropAreaP && dropAreaP.nextSibling) {
            dropArea.insertBefore(fileActions, dropAreaP.nextSibling);
        } else {
            dropArea.appendChild(fileActions);
        }
    }
    
    // Initial form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        startUpload();
    });
    
    // Setup upload controls
    pauseButton.addEventListener('click', pauseUpload);
    resumeButton.addEventListener('click', resumeUpload);
    cancelButton.addEventListener('click', cancelUpload);
    
    // Add toggle for batch operations
    const batchOpToggle = document.createElement('a');
    batchOpToggle.href = '#';
    batchOpToggle.textContent = 'Show Batch Operations';
    batchOpToggle.style.display = 'block';
    batchOpToggle.style.marginTop = '15px';
    batchOpToggle.style.textAlign = 'center';
    
    const batchOperations = document.getElementById('batch-operations');
    batchOperations.style.display = 'none';
    
    form.insertBefore(batchOpToggle, document.getElementById('submit-button'));
    
    batchOpToggle.addEventListener('click', function(e) {
        e.preventDefault();
        if (batchOperations.style.display === 'none') {
            batchOperations.style.display = 'block';
            batchOpToggle.textContent = 'Hide Batch Operations';
        } else {
            batchOperations.style.display = 'none';
            batchOpToggle.textContent = 'Show Batch Operations';
        }
    });
    
    // Toggle advanced options visibility
    const advancedToggle = document.createElement('a');
    advancedToggle.href = '#';
    advancedToggle.textContent = 'Show Advanced Options';
    advancedToggle.style.display = 'block';
    advancedToggle.style.marginTop = '15px';
    advancedToggle.style.textAlign = 'center';
    
    const advancedOptions = document.querySelector('.advanced-options');
    advancedOptions.style.display = 'none';
    
    form.insertBefore(advancedToggle, advancedOptions);
    
    advancedToggle.addEventListener('click', function(e) {
        e.preventDefault();
        if (advancedOptions.style.display === 'none') {
            advancedOptions.style.display = 'block';
            advancedToggle.textContent = 'Hide Advanced Options';
        } else {
            advancedOptions.style.display = 'none';
            advancedToggle.textContent = 'Show Advanced Options';
        }
    });
    
    // Initialize batch operations
    setupBatchRename();
    setupTaggingSystem();
    setupFilteringAndSorting();
    setupBulkOperations();
    
    // Utility functions
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight() {
        dropArea.classList.add('highlight');
    }
    
    function unhighlight() {
        dropArea.classList.remove('highlight');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles({ target: { files: files } });
    }
    
    function handleFiles(e) {
        const files = e.target.files;
        if (files.length > 0) {
            // Add newly selected files to our accumulated array
            const newFiles = Array.from(files);
            accumulatedFiles = [...accumulatedFiles, ...newFiles];
            
            // Update the UI with all accumulated files
            updateFileList(accumulatedFiles);
            previewFiles(accumulatedFiles);
            
            // Clear the file input so the same files can be selected again if needed
            fileInput.value = '';
        }
    }
    
    function updateFileList(files) {
        fileList.innerHTML = '';
        
        if (files.length > 0) {
            // Add select all checkbox
            const selectAllContainer = document.createElement('div');
            selectAllContainer.className = 'select-all-container';
            const selectAllCheckbox = document.createElement('input');
            selectAllCheckbox.type = 'checkbox';
            selectAllCheckbox.id = 'select-all-files';
            selectAllCheckbox.addEventListener('change', function() {
                document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
            });
            const selectAllLabel = document.createElement('label');
            selectAllLabel.htmlFor = 'select-all-files';
            selectAllLabel.textContent = 'Select All';
            selectAllContainer.appendChild(selectAllCheckbox);
            selectAllContainer.appendChild(selectAllLabel);
            fileList.appendChild(selectAllContainer);
            
            // Add file items with checkboxes
            Array.from(files).forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                
                // Create checkbox
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'file-checkbox';
                checkbox.dataset.index = index;
                checkbox.id = `file-checkbox-${index}`;
                
                // Create file info
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';
                fileInfo.innerHTML = `
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${formatFileSize(file.size)})</span>
                    <span class="remove-file" data-index="${index}">✕</span>
                `;
                
                // Add tags if they exist
                if (file.tags && file.tags.length > 0) {
                    const tagContainer = document.createElement('div');
                    tagContainer.className = 'file-tags';
                    
                    file.tags.forEach(tag => {
                        const tagElement = document.createElement('span');
                        tagElement.className = 'file-tag';
                        tagElement.textContent = tag;
                        tagContainer.appendChild(tagElement);
                    });
                    
                    fileInfo.appendChild(tagContainer);
                }
                
                // Assemble file item
                fileItem.appendChild(checkbox);
                fileItem.appendChild(fileInfo);
                fileList.appendChild(fileItem);
            });
            
            // Add event listeners to remove buttons
            document.querySelectorAll('.remove-file').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = parseInt(this.dataset.index);
                    accumulatedFiles = accumulatedFiles.filter((_, i) => i !== index);
                    updateFileList(accumulatedFiles);
                    previewFiles(accumulatedFiles);
                });
            });
        }
    }
    
    function previewFiles(files) {
        previewContainer.innerHTML = '';
        
        if (files.length > 0) {
            Array.from(files).forEach((file, index) => {
                if (file.type.match('image.*')) {
                    // Create image preview
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const previewItem = document.createElement('div');
                        previewItem.className = 'preview-item';
                        previewItem.innerHTML = `
                            <img src="${e.target.result}" alt="${file.name}">
                            <div class="file-name">${file.name}</div>
                        `;
                        previewContainer.appendChild(previewItem);
                    }
                    reader.readAsDataURL(file);
                } else if (file.type.match('video.*')) {
                    // Create video preview
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const previewItem = document.createElement('div');
                        previewItem.className = 'preview-item';
                        previewItem.innerHTML = `
                            <video>
                                <source src="${e.target.result}" type="${file.type}">
                            </video>
                            <div class="video-indicator">▶</div>
                            <div class="file-name">${file.name}</div>
                        `;
                        previewContainer.appendChild(previewItem);
                    }
                    reader.readAsDataURL(file);
                }
            });
        }
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Batch rename functionality
    function setupBatchRename() {
        const previewRenameBtn = document.getElementById('preview-rename');
        const applyRenameBtn = document.getElementById('apply-rename');
        
        previewRenameBtn.addEventListener('click', previewRename);
        applyRenameBtn.addEventListener('click', applyRename);
    }
    
    function previewRename() {
        const pattern = document.getElementById('rename-pattern').value;
        const startIndex = parseInt(document.getElementById('start-index').value);
        const padding = parseInt(document.getElementById('index-padding').value);
        
        if (!pattern) {
            alert('Please enter a rename pattern');
            return;
        }
        
        // Create preview list
        const previewList = document.createElement('div');
        previewList.className = 'rename-preview';
        previewList.innerHTML = '<h4>Rename Preview</h4>';
        
        // Create preview table
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Original Name</th>
                    <th>New Name</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        
        // Generate preview for each file
        accumulatedFiles.forEach((file, i) => {
            const originalName = file.name;
            const fileExt = originalName.split('.').pop();
            const fileType = file.type.split('/')[0]; // 'image' or 'video'
            const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Format the index with padding
            const indexNum = startIndex + i;
            const paddedIndex = indexNum.toString().padStart(padding, '0');
            
            // Replace patterns
            let newName = pattern
                .replace('{index}', paddedIndex)
                .replace('{original}', originalName.replace(`.${fileExt}`, ''))
                .replace('{type}', fileType)
                .replace('{date}', currentDate);
            
            // Add extension if not included in pattern
            if (!newName.endsWith(`.${fileExt}`)) {
                newName += `.${fileExt}`;
            }
            
            // Create table row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${originalName}</td>
                <td>${newName}</td>
            `;
            tbody.appendChild(row);
        });
        
        previewList.appendChild(table);
        
        // Show the preview
        const existingPreview = document.querySelector('.rename-preview');
        if (existingPreview) {
            existingPreview.replaceWith(previewList);
        } else {
            document.getElementById('batch-operations').appendChild(previewList);
        }
    }
    
    function applyRename() {
        const pattern = document.getElementById('rename-pattern').value;
        const startIndex = parseInt(document.getElementById('start-index').value);
        const padding = parseInt(document.getElementById('index-padding').value);
        
        if (!pattern) {
            alert('Please enter a rename pattern');
            return;
        }
        
        if (accumulatedFiles.length === 0) {
            alert('No files to rename');
            return;
        }
        
        // Confirm rename
        if (!confirm(`Rename ${accumulatedFiles.length} files?`)) {
            return;
        }
        
        // Apply rename to each file
        accumulatedFiles.forEach((file, i) => {
            const originalName = file.name;
            const fileExt = originalName.split('.').pop();
            const fileType = file.type.split('/')[0];
            const currentDate = new Date().toISOString().split('T')[0];
            
            // Format the index with padding
            const indexNum = startIndex + i;
            const paddedIndex = indexNum.toString().padStart(padding, '0');
            
            // Replace patterns
            let newName = pattern
                .replace('{index}', paddedIndex)
                .replace('{original}', originalName.replace(`.${fileExt}`, ''))
                .replace('{type}', fileType)
                .replace('{date}', currentDate);
            
            // Add extension if not included in pattern
            if (!newName.endsWith(`.${fileExt}`)) {
                newName += `.${fileExt}`;
            }
            
            // Create a new file object with the new name
            const renamedFile = new File([file], newName, { type: file.type });
            
            // Keep any tags from the original file
            if (file.tags) {
                renamedFile.tags = [...file.tags];
            }
            
            // Replace the file in our array
            accumulatedFiles[i] = renamedFile;
        });
        
        // Update UI
        updateFileList(accumulatedFiles);
        previewFiles(accumulatedFiles);
        
        // Remove preview if it exists
        const existingPreview = document.querySelector('.rename-preview');
        if (existingPreview) {
            existingPreview.remove();
        }
        
        // Show success message
        alert(`Renamed ${accumulatedFiles.length} files successfully`);
    }
    
    // File tagging system
    function setupTaggingSystem() {
        const tagInput = document.getElementById('tag-input');
        const tagSuggestions = document.getElementById('tag-suggestions');
        const activeTagsContainer = document.getElementById('active-tags');
        const applyTagsBtn = document.getElementById('apply-tags');
        const clearTagsBtn = document.getElementById('clear-tags');
        const presetTags = document.querySelectorAll('.preset-tag');
        
        // Set up tag input
        tagInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const tag = this.value.trim().toLowerCase();
                if (tag && !activeTags.includes(tag)) {
                    activeTags.push(tag);
                    updateActiveTags();
                    this.value = '';
                    
                    // Add to available tags if not already there
                    if (!availableTags.includes(tag)) {
                        availableTags.push(tag);
                    }
                }
            }
        });
        
        // Set up tag suggestions
        tagInput.addEventListener('input', function() {
            const value = this.value.trim().toLowerCase();
            if (value.length > 0) {
                // Filter available tags
                const suggestions = availableTags.filter(tag => 
                    tag.includes(value) && !activeTags.includes(tag)
                );
                
                if (suggestions.length > 0) {
                    tagSuggestions.innerHTML = '';
                    suggestions.forEach(tag => {
                        const suggestionItem = document.createElement('div');
                        suggestionItem.className = 'tag-suggestion';
                        suggestionItem.textContent = tag;
                        suggestionItem.addEventListener('click', function() {
                            activeTags.push(tag);
                            updateActiveTags();
                            tagInput.value = '';
                            tagSuggestions.classList.add('hidden');
                        });
                        tagSuggestions.appendChild(suggestionItem);
                    });
                    tagSuggestions.classList.remove('hidden');
                } else {
                    tagSuggestions.classList.add('hidden');
                }
            } else {
                tagSuggestions.classList.add('hidden');
            }
        });
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', function(e) {
            if (!tagInput.contains(e.target) && !tagSuggestions.contains(e.target)) {
                tagSuggestions.classList.add('hidden');
            }
        });
        
        // Set up preset tags
        presetTags.forEach(tagElement => {
            tagElement.addEventListener('click', function() {
                const tag = this.dataset.tag;
                if (!activeTags.includes(tag)) {
                    activeTags.push(tag);
                    updateActiveTags();
                }
            });
        });
        
        // Apply tags to selected files
        applyTagsBtn.addEventListener('click', applyTagsToSelected);
        clearTagsBtn.addEventListener('click', clearTagsFromSelected);
        
        // Initial render
        updateActiveTags();
    }
    
    function updateActiveTags() {
        const container = document.getElementById('active-tags');
        container.innerHTML = '';
        
        activeTags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'active-tag';
            tagElement.innerHTML = `
                ${tag}
                <span class="remove-tag">×</span>
            `;
            
            // Add remove functionality
            tagElement.querySelector('.remove-tag').addEventListener('click', function() {
                activeTags = activeTags.filter(t => t !== tag);
                updateActiveTags();
            });
            
            container.appendChild(tagElement);
        });
    }
    
    function applyTagsToSelected() {
        if (activeTags.length === 0) {
            alert('No tags to apply. Please add at least one tag.');
            return;
        }
        
        const selectedFiles = getSelectedFiles();
        if (selectedFiles.length === 0) {
            alert('No files selected. Please select files to tag.');
            return;
        }
        
        // Apply tags to selected files
        selectedFiles.forEach(fileIndex => {
            if (!accumulatedFiles[fileIndex].tags) {
                accumulatedFiles[fileIndex].tags = [];
            }
            
            // Add tags that don't already exist on the file
            activeTags.forEach(tag => {
                if (!accumulatedFiles[fileIndex].tags.includes(tag)) {
                    accumulatedFiles[fileIndex].tags.push(tag);
                }
            });
        });
        
        // Update file list to show tags
        updateFileList(accumulatedFiles);
        
        alert(`Applied ${activeTags.length} tags to ${selectedFiles.length} files`);
        
        // Update tag filter options
        updateTagFilterOptions();
    }
    
    function clearTagsFromSelected() {
        const selectedFiles = getSelectedFiles();
        if (selectedFiles.length === 0) {
            alert('No files selected. Please select files to clear tags from.');
            return;
        }
        
        // Clear tags from selected files
        selectedFiles.forEach(fileIndex => {
            accumulatedFiles[fileIndex].tags = [];
        });
        
        // Update file list
        updateFileList(accumulatedFiles);
        
        alert(`Cleared tags from ${selectedFiles.length} files`);
        
        // Update tag filter options
        updateTagFilterOptions();
    }
    
    function getSelectedFiles() {
        // Get files that are checked
        const selectedIndexes = [];
        document.querySelectorAll('.file-checkbox:checked').forEach(checkbox => {
            selectedIndexes.push(parseInt(checkbox.dataset.index));
        });
        return selectedIndexes;
    }
    
    // Filtering and sorting
    function setupFilteringAndSorting() {
        const filterTypeSelect = document.getElementById('filter-type');
        const filterTagSelect = document.getElementById('filter-tag');
        const sortBySelect = document.getElementById('sort-by');
        const applyFiltersBtn = document.getElementById('apply-filters');
        const resetFiltersBtn = document.getElementById('reset-filters');
        
        // Apply filters and sorting
        applyFiltersBtn.addEventListener('click', function() {
            applyFiltersAndSort();
        });
        
        // Reset filters
        resetFiltersBtn.addEventListener('click', function() {
            filterTypeSelect.value = 'all';
            filterTagSelect.value = 'all';
            sortBySelect.value = 'name-asc';
            
            // Show all files
            updateFileList(accumulatedFiles);
            previewFiles(accumulatedFiles);
        });
        
        // Initial tag filter options
        updateTagFilterOptions();
    }
    
    function updateTagFilterOptions() {
        const filterTagSelect = document.getElementById('filter-tag');
        
        // Get all unique tags from files
        const allTags = [];
        accumulatedFiles.forEach(file => {
            if (file.tags && file.tags.length > 0) {
                file.tags.forEach(tag => {
                    if (!allTags.includes(tag)) {
                        allTags.push(tag);
                    }
                });
            }
        });
        
        // Update filter options
        filterTagSelect.innerHTML = '<option value="all">All Tags</option>';
        allTags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            filterTagSelect.appendChild(option);
        });
    }
    
    function applyFiltersAndSort() {
        const filterTypeSelect = document.getElementById('filter-type');
        const filterTagSelect = document.getElementById('filter-tag');
        const sortBySelect = document.getElementById('sort-by');
        
        const typeFilter = filterTypeSelect.value;
        const tagFilter = filterTagSelect.value;
        const sortBy = sortBySelect.value;
        
        // First filter the files
        let filteredFiles = [...accumulatedFiles];
        
        // Apply type filter
        if (typeFilter !== 'all') {
            filteredFiles = filteredFiles.filter(file => 
                file.type.startsWith(typeFilter)
            );
        }
        
        // Apply tag filter
        if (tagFilter !== 'all') {
            filteredFiles = filteredFiles.filter(file => 
                file.tags && file.tags.includes(tagFilter)
            );
        }
        
        // Apply sorting
        filteredFiles.sort((a, b) => {
            switch (sortBy) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'size-asc':
                    return a.size - b.size;
                case 'size-desc':
                    return b.size - a.size;
                case 'type':
                    return a.type.localeCompare(b.type);
                default:
                    return 0;
            }
        });
        
        // Update UI with filtered and sorted files
        // Note: We don't modify accumulatedFiles, just what's shown
        updateFilteredFileList(filteredFiles);
        previewFilteredFiles(filteredFiles);
    }
    
    // Display filtered files but maintain the original indexes
    function updateFilteredFileList(filteredFiles) {
        fileList.innerHTML = '';
        
        if (filteredFiles.length > 0) {
            // Add select all checkbox
            const selectAllContainer = document.createElement('div');
            selectAllContainer.className = 'select-all-container';
            const selectAllCheckbox = document.createElement('input');
            selectAllCheckbox.type = 'checkbox';
            selectAllCheckbox.id = 'select-all-files';
            selectAllCheckbox.addEventListener('change', function() {
                document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
            });
            const selectAllLabel = document.createElement('label');
            selectAllLabel.htmlFor = 'select-all-files';
            selectAllLabel.textContent = 'Select All';
            selectAllContainer.appendChild(selectAllCheckbox);
            selectAllContainer.appendChild(selectAllLabel);
            fileList.appendChild(selectAllContainer);
            
            // Add filtered file items
            filteredFiles.forEach(file => {
                // Find original index
                const originalIndex = accumulatedFiles.findIndex(f => f === file);
                if (originalIndex === -1) return;
                
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                
                // Create checkbox
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'file-checkbox';
                checkbox.dataset.index = originalIndex;
                checkbox.id = `file-checkbox-${originalIndex}`;
                
                // Create file info
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';
                fileInfo.innerHTML = `
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${formatFileSize(file.size)})</span>
                    <span class="remove-file" data-index="${originalIndex}">✕</span>
                `;
                
                // Add tags if they exist
                if (file.tags && file.tags.length > 0) {
                    const tagContainer = document.createElement('div');
                    tagContainer.className = 'file-tags';
                    
                    file.tags.forEach(tag => {
                        const tagElement = document.createElement('span');
                        tagElement.className = 'file-tag';
                        tagElement.textContent = tag;
                        tagContainer.appendChild(tagElement);
                    });
                    
                    fileInfo.appendChild(tagContainer);
                }
                
                // Assemble file item
                fileItem.appendChild(checkbox);
                fileItem.appendChild(fileInfo);
                fileList.appendChild(fileItem);
            });
            
            // Add event listeners to remove buttons
            document.querySelectorAll('.remove-file').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = parseInt(this.dataset.index);
                    accumulatedFiles = accumulatedFiles.filter((_, i) => i !== index);
                    
                    // Update both the full list and filters
                    updateTagFilterOptions();
                    applyFiltersAndSort();
                });
            });
        } else {
            fileList.innerHTML = '<div class="no-files">No files match the current filters</div>';
        }
    }
    
    // Preview only filtered files
    function previewFilteredFiles(filteredFiles) {
        previewContainer.innerHTML = '';
        
        if (filteredFiles.length > 0) {
            filteredFiles.forEach((file) => {
                if (file.type.match('image.*')) {
                    // Create image preview
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const previewItem = document.createElement('div');
                        previewItem.className = 'preview-item';
                        previewItem.innerHTML = `
                            <img src="${e.target.result}" alt="${file.name}">
                            <div class="file-name">${file.name}</div>
                        `;
                        previewContainer.appendChild(previewItem);
                    }
                    reader.readAsDataURL(file);
                } else if (file.type.match('video.*')) {
                    // Create video preview
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const previewItem = document.createElement('div');
                        previewItem.className = 'preview-item';
                        previewItem.innerHTML = `
                            <video>
                                <source src="${e.target.result}" type="${file.type}">
                            </video>
                            <div class="video-indicator">▶</div>
                            <div class="file-name">${file.name}</div>
                        `;
                        previewContainer.appendChild(previewItem);
                    }
                    reader.readAsDataURL(file);
                }
            });
        }
    }
    
    // Bulk operations
    function setupBulkOperations() {
        const selectAllFailedBtn = document.getElementById('select-all-failed');
        const selectAllSuccessBtn = document.getElementById('select-all-success');
        const selectNoneBtn = document.getElementById('select-none');
        const retrySelectedBtn = document.getElementById('retry-selected');
        const removeSelectedBtn = document.getElementById('remove-selected');
        const downloadSelectedBtn = document.getElementById('download-selected');
        
        // Select all failed uploads
        selectAllFailedBtn.addEventListener('click', function() {
            // Clear existing selections
            document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            
            // Select failed uploads
            const failedItems = document.querySelectorAll('.file-status-failed');
            failedItems.forEach(item => {
                const fileIndex = item.closest('.file-progress-item').id.split('-').pop();
                const checkbox = document.querySelector(`.file-checkbox[data-index="${fileIndex}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        });
        
        // Select all successful uploads
        selectAllSuccessBtn.addEventListener('click', function() {
            // Clear existing selections
            document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            
            // Select successful uploads
            const successItems = document.querySelectorAll('.file-status-success');
            successItems.forEach(item => {
                const fileIndex = item.closest('.file-progress-item').id.split('-').pop();
                const checkbox = document.querySelector(`.file-checkbox[data-index="${fileIndex}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        });
        
        // Deselect all
        selectNoneBtn.addEventListener('click', function() {
            document.querySelectorAll('.file-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
        });
        
        // Retry selected
        retrySelectedBtn.addEventListener('click', async function() {
            const selectedIndexes = getSelectedFiles();
            if (selectedIndexes.length === 0) {
                alert('No files selected for retry.');
                return;
            }
            
            if (!confirm(`Retry ${selectedIndexes.length} selected files?`)) {
                return;
            }
            
            // Disable button during retry
            this.disabled = true;
            
            // Retry each file
            for (const fileIndex of selectedIndexes) {
                const retryButton = document.querySelector(`.file-progress-item[id="progress-item-${fileIndex}"] .retry-button`);
                if (retryButton) {
                    retryButton.click();
                    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between retries
                }
            }
            
            // Re-enable button
            this.disabled = false;
        });
        
        // Remove selected
        removeSelectedBtn.addEventListener('click', function() {
            const selectedIndexes = getSelectedFiles();
            if (selectedIndexes.length === 0) {
                alert('No files selected for removal.');
                return;
            }
            
            if (!confirm(`Remove ${selectedIndexes.length} selected files? This cannot be undone.`)) {
                return;
            }
            
            // Remove files in reverse order to prevent index issues
            const sortedIndexes = [...selectedIndexes].sort((a, b) => b - a);
            sortedIndexes.forEach(index => {
                accumulatedFiles.splice(index, 1);
            });
            
            // Update UI
            updateFileList(accumulatedFiles);
            previewFiles(accumulatedFiles);
            
            alert(`Removed ${selectedIndexes.length} files`);
        });
        
        // Download results for selected
        downloadSelectedBtn.addEventListener('click', function() {
            const selectedIndexes = getSelectedFiles();
            if (selectedIndexes.length === 0) {
                alert('No files selected for download.');
                return;
            }
            
            // Get results for selected files
            const selectedResults = [];
            const resultsTable = document.querySelector('#results-content table');
            if (resultsTable) {
                const rows = resultsTable.querySelectorAll('tbody tr');
                selectedIndexes.forEach(index => {
                    if (rows.length > index) {
                        const row = rows[index];
                        selectedResults.push({
                            name: row.cells[0].textContent,
                            type: row.cells[1].textContent,
                            status: row.cells[2].textContent,
                            hash: row.cells[3].textContent,
                            thumbnail_hash: row.cells[4].textContent,
                            attempts: parseInt(row.cells[5].textContent)
                        });
                    }
                });
            }
            
            if (selectedResults.length > 0) {
                // Generate JSON file
                const dataStr = JSON.stringify(selectedResults, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute('href', dataUri);
                downloadAnchorNode.setAttribute('download', 'selected_results.json');
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            } else {
                alert('No result data available for selected files.');
            }
        });
    }
    
    // Main upload functions
    async function startUpload() {
        const files = accumulatedFiles;
        if (!files || files.length === 0) {
            alert('Please select at least one file to upload.');
            return;
        }
        
        // Get form data
        const accessToken = document.getElementById('access-token').value;
        const adAccountId = document.getElementById('ad-account-id').value;
        const action = document.getElementById('action').value;
        
        // Validate inputs
        if (!accessToken) {
            alert('Please enter your Facebook Access Token.');
            return;
        }
        
        if (!adAccountId) {
            alert('Please enter your Ad Account ID.');
            return;
        }
        
        // Disable submit button
        submitButton.disabled = true;
        
        // Show progress and controls
        progress.classList.remove('hidden');
        uploadControls.classList.remove('hidden');
        
        // Reset controls
        pauseButton.disabled = false;
        resumeButton.disabled = true;
        cancelButton.disabled = false;
        
        // Reset state variables
        isPaused = false;
        isCancelled = false;
        
        // Display individual progress items
        setupProgressUI(files);
        
        // Choose upload method
        if (files.length <= 5) {
            // For small batches, use individual upload with XHR for progress
            await uploadFilesIndividually(files);
        } else {
            // For larger batches, use batch upload with pause/resume
            await uploadFilesWithPauseResume(files);
        }
    }
    
    async function uploadFilesIndividually(files) {
        const results = [];
        const totalFiles = files.length;
        
        // Get form data
        const accessToken = document.getElementById('access-token').value;
        const adAccountId = document.getElementById('ad-account-id').value;
        const getThumbnails = document.getElementById('get-thumbnails').checked;
        
        // Process each file with progress tracking
        for (let i = 0; i < files.length; i++) {
            if (isCancelled) {
                break;
            }
            
            const file = files[i];
            const progressFill = document.getElementById(`progress-fill-${i}`);
            const progressPercent = document.getElementById(`progress-percent-${i}`);
            const progressStatus = document.getElementById(`progress-status-${i}`);
            
            // Update status
            progressStatus.textContent = 'Uploading...';
            
            try {
                // Upload the file with progress tracking
                const result = await uploadSingleFile(file, i, {
                    accessToken,
                    adAccountId,
                    getThumbnails,
                    onProgress: (percent) => {
                        progressFill.style.width = `${percent}%`;
                        progressPercent.textContent = `${percent}%`;
                    }
                });
                
                // Update UI based on result
                progressFill.style.width = '100%';
                progressPercent.textContent = '100%';
                
                if (result.status === 'success') {
                    progressStatus.textContent = 'Success';
                    progressStatus.className = 'file-status-success';
                } else {
                    progressStatus.textContent = 'Failed: ' + (result.error || 'Unknown error');
                    progressStatus.className = 'file-status-failed';
                    
                    // Add retry button
                    const retryButton = document.createElement('button');
                    retryButton.className = 'retry-button';
                    retryButton.textContent = 'Retry';
                    retryButton.dataset.index = i;
                    retryButton.addEventListener('click', handleRetry);
                    progressStatus.appendChild(retryButton);
                }
                
                results.push(result);
                
            } catch (error) {
                console.error('Upload error:', error);
                
                progressFill.style.width = '100%';
                progressPercent.textContent = '100%';
                progressStatus.textContent = 'Failed: ' + error.message;
                progressStatus.className = 'file-status-failed';
                
                // Add retry button
                const retryButton = document.createElement('button');
                retryButton.className = 'retry-button';
                retryButton.textContent = 'Retry';
                retryButton.dataset.index = i;
                retryButton.addEventListener('click', handleRetry);
                progressStatus.appendChild(retryButton);
                
                results.push({
                    name: file.name,
                    status: 'failed',
                    error: error.message
                });
            }
            
            // Update overall progress
            updateOverallProgress(i + 1, totalFiles);
        }
        
        // Enable submit button
        submitButton.disabled = false;
        
        // Add retry all button if needed
        addRetryAllButton();
        
        // Store session ID for results
        sessionId = Date.now().toString();
        
        // Display final results and enable export
        displayResults(results);
        if (results.length > 0) {
            enableExport(sessionId, results);
        }
        
        return results;
    }
    
    async function uploadFilesWithPauseResume(files) {
        try {
            // Step 1: Create upload session
            const sessionResponse = await fetch('/create-upload-session', {
                method: 'POST'
            });
            
            if (!sessionResponse.ok) {
                throw new Error('Failed to create upload session');
            }
            
            const sessionData = await sessionResponse.json();
            sessionId = sessionData.session_id;
            
            // Step 2: Upload files batch
            const formData = new FormData();
            formData.append('access_token', document.getElementById('access-token').value);
            formData.append('ad_account_id', document.getElementById('ad-account-id').value);
            
            // Add all files
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
            }
            
            const batchResponse = await fetch(`/upload-batch/${sessionId}`, {
                method: 'POST',
                body: formData
            });
            
            if (!batchResponse.ok) {
                throw new Error('Failed to prepare files for upload');
            }
            
            // Step 3: Start upload
            await fetch(`/start-upload/${sessionId}`, {
                method: 'POST'
            });
            
            // Step 4: Process files one by one
            const results = await processUploadQueue(sessionId, files.length);
            
            // Step 5: Display results
            displayResults(results);
            if (results.length > 0) {
                enableExport(sessionId, results);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed: ' + error.message);
        } finally {
            // Re-enable submit button
            submitButton.disabled = false;
        }
    }
    
    async function processUploadQueue(uploadSessionId, totalFiles) {
        const results = [];
        let currentIndex = 0;
        
        // Process until complete or cancelled
        while (currentIndex < totalFiles) {
            // Check if paused
            if (isPaused) {
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            
            // Check if cancelled
            if (isCancelled) {
                updateOverallProgress(currentIndex, totalFiles);
                break;
            }
            
            // Update current file status
            const progressStatus = document.getElementById(`progress-status-${currentIndex}`);
            progressStatus.textContent = 'Uploading...';
            
            try {
                // Upload the next file
                const response = await fetch(`/upload-next/${uploadSessionId}`, {
                    method: 'POST'
                });
                
                const data = await response.json();
                
                // Check upload session status
                if (data.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                
                if (data.status === 'cancelled') {
                    break;
                }
                
                if (data.status === 'completed') {
                    break;
                }
                
                // Handle successful upload
                const progressFill = document.getElementById(`progress-fill-${currentIndex}`);
                progressFill.style.width = '100%';
                
                const progressPercent = document.getElementById(`progress-percent-${currentIndex}`);
                progressPercent.textContent = '100%';
                
                if (data.status === 'success') {
                    progressStatus.textContent = 'Success';
                    progressStatus.className = 'file-status-success';
                    results.push(data.result);
                } else {
                    progressStatus.textContent = 'Failed: ' + (data.error || 'Unknown error');
                    progressStatus.className = 'file-status-failed';
                    
                    // Add retry button
                    const retryButton = document.createElement('button');
                    retryButton.className = 'retry-button';
                    retryButton.textContent = 'Retry';
                    retryButton.dataset.index = currentIndex;
                    retryButton.addEventListener('click', handleRetry);
                    progressStatus.appendChild(retryButton);
                    
                    if (data.result) {
                        results.push(data.result);
                    } else {
                        results.push({
                            name: document.getElementById(`progress-item-${currentIndex}`).querySelector('.file-progress-name').textContent,
                            status: 'failed',
                            error: data.error
                        });
                    }
                }
                
                // Update currentIndex from server
                currentIndex = data.current_index;
                
                // Update overall progress
                updateOverallProgress(currentIndex, totalFiles);
                
            } catch (error) {
                // Handle error
                const progressFill = document.getElementById(`progress-fill-${currentIndex}`);
                progressFill.style.width = '100%';
                
                const progressPercent = document.getElementById(`progress-percent-${currentIndex}`);
                progressPercent.textContent = '100%';
                
                const progressStatus = document.getElementById(`progress-status-${currentIndex}`);
                progressStatus.textContent = 'Failed: ' + error.message;
                progressStatus.className = 'file-status-failed';
                
                // Add retry button
                const retryButton = document.createElement('button');
                retryButton.className = 'retry-button';
                retryButton.textContent = 'Retry';
                retryButton.dataset.index = currentIndex;
                retryButton.addEventListener('click', handleRetry);
                progressStatus.appendChild(retryButton);
                
                results.push({
                    name: document.getElementById(`progress-item-${currentIndex}`).querySelector('.file-progress-name').textContent,
                    status: 'failed',
                    error: error.message
                });
                
                // Move to next file
                currentIndex++;
                
                // Update overall progress
                updateOverallProgress(currentIndex, totalFiles);
            }
        }
        
        // Add retry all button if needed
        addRetryAllButton();
        
        return results;
    }
    
    // Setup progress UI for all files
    function setupProgressUI(files) {
        // Reset progress container
        const fileProgressContainer = document.getElementById('file-progress-container');
        fileProgressContainer.innerHTML = '';
        
        // Create progress items for each file
        Array.from(files).forEach((file, index) => {
            const progressItem = document.createElement('div');
            progressItem.className = 'file-progress-item';
            progressItem.id = `progress-item-${index}`;
            progressItem.innerHTML = `
                <div class="file-progress-name">${file.name}</div>
                <div class="file-progress-bar">
                    <div class="file-progress-fill" id="progress-fill-${index}"></div>
                </div>
                <div class="file-progress-status">
                    <span id="progress-percent-${index}">0%</span>
                    <span id="progress-status-${index}">Waiting...</span>
                </div>
            `;
            fileProgressContainer.appendChild(progressItem);
        });
        
        // Initialize overall progress
        const overallProgressFill = document.querySelector('#overall-progress .progress-fill');
        overallProgressFill.style.width = '0%';
        progressText.textContent = `0% (0/${files.length} files)`;
    }
    
    // Update overall progress indicator
    function updateOverallProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        const overallProgressFill = document.querySelector('#overall-progress .progress-fill');
        
        overallProgressFill.style.width = `${percent}%`;
        progressText.textContent = `${percent}% (${current}/${total} files)`;
    }
    
    // Upload a single file with progress tracking
    function uploadSingleFile(file, index, options) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Create form data for this file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('access_token', options.accessToken);
            formData.append('ad_account_id', options.adAccountId);
            formData.append('file_index', index);
            formData.append('get_thumbnails', options.getThumbnails.toString());
            
            // Setup progress tracking
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    if (options.onProgress) {
                        options.onProgress(percentComplete);
                    }
                    
                    // Emit progress via Socket.IO if available
                    if (socket) {
                        socket.emit('upload_progress', {
                            fileIndex: index,
                            fileName: file.name,
                            progress: percentComplete
                        });
                    }
                }
            };
            
            // Handle completion
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`HTTP Error: ${xhr.status}`));
                }
            };
            
            // Handle errors
            xhr.onerror = function() {
                reject(new Error('Network Error'));
            };
            
            // Send the request
            xhr.open('POST', '/upload-file', true);
            xhr.send(formData);
        });
    }
    
    // Add retry buttons to failed uploads
    function addRetryAllButton() {
        const failedItems = document.querySelectorAll('.file-status-failed');
        if (failedItems.length === 0) return;
        
        // Check if retry all button already exists
        if (!document.querySelector('.retry-all-button')) {
            const retryAllButton = document.createElement('button');
            retryAllButton.className = 'retry-all-button';
            retryAllButton.textContent = 'Retry All Failed Uploads';
            retryAllButton.style.display = 'block';
            retryAllButton.addEventListener('click', handleRetryAll);
            
            document.getElementById('file-progress-container').after(retryAllButton);
        }
    }
    
    // Handle retry for a single file
    async function handleRetry(e) {
        const fileIndex = parseInt(e.target.dataset.index);
        const file = accumulatedFiles[fileIndex];
        
        if (!file) {
            alert('File no longer available. Please select files again.');
            return;
        }
        
        // Disable the retry button during retry
        e.target.disabled = true;
        
        const progressFill = document.getElementById(`progress-fill-${fileIndex}`);
        const progressPercent = document.getElementById(`progress-percent-${fileIndex}`);
        const progressStatus = document.getElementById(`progress-status-${fileIndex}`);
        
        // Reset progress
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressStatus.textContent = 'Retrying...';
        
        // Remove any existing retry button
        const existingButton = progressStatus.querySelector('.retry-button');
        if (existingButton) {
            existingButton.remove();
        }
        
        try {
            // Get form data
            const accessToken = document.getElementById('access-token').value;
            const adAccountId = document.getElementById('ad-account-id').value;
            const getThumbnails = document.getElementById('get-thumbnails').checked;
            
            // Upload file again
            const result = await uploadSingleFile(file, fileIndex, {
                accessToken,
                adAccountId,
                getThumbnails,
                onProgress: (percent) => {
                    progressFill.style.width = `${percent}%`;
                    progressPercent.textContent = `${percent}%`;
                }
            });
            
            // Update UI based on result
            progressFill.style.width = '100%';
            progressPercent.textContent = '100%';
            
            if (result.status === 'success') {
                progressStatus.textContent = 'Success';
                progressStatus.className = 'file-status-success';
            } else {
                progressStatus.textContent = 'Failed: ' + (result.error || 'Unknown error');
                progressStatus.className = 'file-status-failed';
                
                // Add retry button again
                const retryButton = document.createElement('button');
                retryButton.className = 'retry-button';
                retryButton.textContent = 'Retry';
                retryButton.dataset.index = fileIndex;
                retryButton.addEventListener('click', handleRetry);
                progressStatus.appendChild(retryButton);
            }
            
            // Update results list
            updateResultsTableRow(fileIndex, result);
            updateSummary();
            
        } catch (error) {
            progressFill.style.width = '100%';
            progressPercent.textContent = '100%';
            progressStatus.textContent = 'Failed: ' + error.message;
            progressStatus.className = 'file-status-failed';
            
            // Add retry button again
            const retryButton = document.createElement('button');
            retryButton.className = 'retry-button';
            retryButton.textContent = 'Retry';
            retryButton.dataset.index = fileIndex;
            retryButton.addEventListener('click', handleRetry);
            progressStatus.appendChild(retryButton);
            
            // Update results list
            updateResultsTableRow(fileIndex, {
                name: file.name,
                status: 'failed',
                error: error.message
            });
            updateSummary();
        }
        
        // Check if all are now successful
        checkAllSuccess();
    }
    
    // Handle retry all failed uploads
    async function handleRetryAll() {
        const failedItems = document.querySelectorAll('.file-status-failed');
        const retryAllButton = document.querySelector('.retry-all-button');
        
        // Disable retry all button during retries
        retryAllButton.disabled = true;
        
        for (const item of failedItems) {
            const retryButton = item.querySelector('.retry-button');
            if (retryButton && !retryButton.disabled) {
                // Click the retry button (uses existing retry logic)
                retryButton.click();
                
                // Small delay between retries
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Re-enable retry all button
        retryAllButton.disabled = false;
    }
    
    // Check if all files are now successful
    function checkAllSuccess() {
        const failedItems = document.querySelectorAll('.file-status-failed');
        
        if (failedItems.length === 0) {
            // Hide retry all button if visible
            const retryAllButton = document.querySelector('.retry-all-button');
            if (retryAllButton) {
                retryAllButton.style.display = 'none';
            }
        }
    }
    
    // Update a row in the results table
    function updateResultsTableRow(index, result) {
        const table = document.querySelector('#results-content table');
        if (!table) return;
        
        const rows = table.querySelectorAll('tbody tr');
        if (rows.length > index) {
            const row = rows[index];
            
            // Update cell values
            row.cells[2].textContent = result.status;
            row.cells[2].className = result.status === 'success' ? 'success' : 'failed';
            row.cells[3].textContent = result.hash || result.id || 'N/A';
            row.cells[4].textContent = result.thumbnail_hash || 'N/A';
            
            // Increment attempts
            const attemptsCell = row.cells[5];
            const currentAttempts = parseInt(attemptsCell.textContent);
            attemptsCell.textContent = (currentAttempts + 1).toString();
        }
    }
    
    // Update summary statistics
    function updateSummary() {
        const summary = document.querySelector('.summary');
        if (!summary) return;
        
        const table = document.querySelector('#results-content table');
        if (!table) return;
        
        const rows = table.querySelectorAll('tbody tr');
        const totalItems = rows.length;
        let successItems = 0;
        let failedItems = 0;
        
        rows.forEach(row => {
            const statusCell = row.cells[2];
            if (statusCell.textContent === 'success') {
                successItems++;
            } else {
                failedItems++;
            }
        });
        
        summary.innerHTML = `
            <p>
                <strong>Total:</strong> ${totalItems} |
                <strong>Successful:</strong> ${successItems} |
                <strong>Failed:</strong> ${failedItems}
            </p>
        `;
    }
    
    // Display results in a table
    function displayResults(data) {
        // Clear previous results
        resultsContent.innerHTML = '';
        
        if (!data || data.length === 0) {
            resultsContent.innerHTML = '<p>No results returned.</p>';
            return;
        }
        
        // Create table
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Hash/ID</th>
                    <th>Thumbnail Hash</th>
                    <th>Attempts</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        
        // Add rows for each result
        data.forEach(item => {
            const row = document.createElement('tr');
            const statusClass = item.status === 'success' ? 'success' : 'failed';
            
            row.innerHTML = `
                <td>${item.name}</td>
                <td>${item.type || 'Unknown'}</td>
                <td class="${statusClass}">${item.status}</td>
                <td>${item.hash || item.id || 'N/A'}</td>
                <td>${item.thumbnail_hash || 'N/A'}</td>
                <td>${item.attempts || 1}</td>
            `;
            tbody.appendChild(row);
        });
        
        resultsContent.appendChild(table);
        
        // Add summary
        const total = data.length;
        const successful = data.filter(item => item.status === 'success').length;
        const failed = total - successful;
        
        const summary = document.createElement('div');
        summary.classList.add('summary');
        summary.innerHTML = `
            <p>
                <strong>Total:</strong> ${total} |
                <strong>Successful:</strong> ${successful} |
                <strong>Failed:</strong> ${failed}
            </p>
        `;
        
        resultsContent.appendChild(summary);
        
        // Show results section
        results.classList.remove('hidden');
    }
    
    // Enable export options
    function enableExport(sessionId, results) {
        exportOptions.classList.remove('hidden');
        
        // Remove any existing event listeners
        const downloadJsonBtn = document.getElementById('download-json');
        const newDownloadJsonBtn = downloadJsonBtn.cloneNode(true);
        downloadJsonBtn.parentNode.replaceChild(newDownloadJsonBtn, downloadJsonBtn);
        
        const downloadCsvBtn = document.getElementById('download-csv');
        const newDownloadCsvBtn = downloadCsvBtn.cloneNode(true);
        downloadCsvBtn.parentNode.replaceChild(newDownloadCsvBtn, downloadCsvBtn);
        
        // Add new event listeners with current session ID
        document.getElementById('download-json').addEventListener('click', function() {
            // For direct upload method without server-side session
            if (sessionId.length > 10) {
                // Generate JSON file client-side
                const dataStr = JSON.stringify(results, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute('href', dataUri);
                downloadAnchorNode.setAttribute('download', 'ad_media_results.json');
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            } else {
                // Use server-side download
                window.location.href = `/download/${sessionId}`;
            }
        });
        
        document.getElementById('download-csv').addEventListener('click', function() {
            // For direct upload method without server-side session
            if (sessionId.length > 10) {
                // Generate CSV file client-side
                const headers = ['name', 'type', 'status', 'hash', 'id', 'thumbnail_hash', 'attempts'];
                
                let csvContent = headers.join(',') + '\n';
                
                results.forEach(item => {
                    const row = [
                        `"${(item.name || '').replace(/"/g, '""')}"`,
                        `"${(item.type || '').replace(/"/g, '""')}"`,
                        `"${(item.status || '').replace(/"/g, '""')}"`,
                        `"${(item.hash || '').replace(/"/g, '""')}"`,
                        `"${(item.id || '').replace(/"/g, '""')}"`,
                        `"${(item.thumbnail_hash || '').replace(/"/g, '""')}"`,
                        item.attempts || 1
                    ];
                    csvContent += row.join(',') + '\n';
                });
                
                const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
                
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute('href', dataUri);
                downloadAnchorNode.setAttribute('download', 'ad_media_results.csv');
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            } else {
                // Use server-side download
                window.location.href = `/download/${sessionId}/csv`;
            }
        });
    }
    
    // Pause upload
    function pauseUpload() {
        isPaused = true;
        pauseButton.disabled = true;
        resumeButton.disabled = false;
        
        // If using server-side pause/resume
        if (sessionId && sessionId.length < 15) {
            fetch(`/pause-upload/${sessionId}`, {
                method: 'POST'
            }).catch(error => {
                console.error('Failed to pause upload:', error);
            });
        }
    }
    
    // Resume upload
    function resumeUpload() {
        isPaused = false;
        pauseButton.disabled = false;
        resumeButton.disabled = true;
        
        // If using server-side pause/resume
        if (sessionId && sessionId.length < 15) {
            fetch(`/resume-upload/${sessionId}`, {
                method: 'POST'
            }).catch(error => {
                console.error('Failed to resume upload:', error);
            });
        }
    }
    
       // Cancel upload
    function cancelUpload() {
        if (confirm('Are you sure you want to cancel the upload? Completed uploads will still be saved.')) {
            isCancelled = true;
            pauseButton.disabled = true;
            resumeButton.disabled = true;
            cancelButton.disabled = true;
            
            // If using server-side pause/resume
            if (sessionId && sessionId.length < 15) {
                fetch(`/cancel-upload/${sessionId}`, {
                    method: 'POST'
                }).catch(error => {
                    console.error('Failed to cancel upload:', error);
                });
            }
            
            // Re-enable submit button
            submitButton.disabled = false;
        }
    }
    
    // Listen for Socket.IO progress updates
    socket.on('progress_update', function(data) {
        const progressFill = document.getElementById(`progress-fill-${data.fileIndex}`);
        const progressPercent = document.getElementById(`progress-percent-${data.fileIndex}`);
        
        if (progressFill && progressPercent) {
            progressFill.style.width = `${data.progress}%`;
            progressPercent.textContent = `${data.progress}%`;
        }
    });
});