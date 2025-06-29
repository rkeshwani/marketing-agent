import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AssetsSection({ projectId, projectName, onBackToProjects }) {
  const [assets, setAssets] = useState([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [assetError, setAssetError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');

  const fetchAssets = async () => {
    if (!projectId) return;
    setIsLoadingAssets(true);
    setAssetError(null);
    try {
      const response = await axios.get(`/api/projects/${projectId}/assets`);
      setAssets(response.data);
    } catch (error) {
      console.error(`Failed to fetch assets for project ${projectId}:`, error);
      setAssetError(error.response?.data?.error || 'Failed to load assets.');
      setAssets([]);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [projectId]);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setUploadStatus('');
  };

  const handleUploadAsset = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setUploadStatus('Error: No file selected.');
      return;
    }
    if (!projectId) {
      setUploadStatus('Error: No project selected for upload.');
      return;
    }

    const formData = new FormData();
    formData.append('assetFile', selectedFile);

    setUploadStatus('Uploading...');
    try {
      const response = await axios.post(`/api/projects/${projectId}/assets/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadStatus(`Upload successful: ${response.data.name}`);
      setSelectedFile(null); // Clear file input
      event.target.reset(); // Reset the form to clear the file input display
      fetchAssets(); // Refresh asset list
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus(`Upload failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setTimeout(() => setUploadStatus(''), 5000); // Clear status after 5s
    }
  };

  const handleDeleteAsset = async (assetId) => {
    if (!projectId || !assetId) {
      alert('Error: Project ID or Asset ID missing.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete asset ${assetId}? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/projects/${projectId}/assets/${assetId}`);
        alert('Asset deleted successfully.');
        fetchAssets(); // Refresh asset list
      } catch (error) {
        console.error('Delete failed:', error);
        alert(`Error deleting asset: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  if (!projectId) {
    // This case should ideally be handled by App.jsx not rendering this component
    return <p>No project selected to manage assets.</p>;
  }

  return (
    <div id="assets-section"> {/* Keep ID if CSS relies on it */}
      <h3>Assets for {projectName}</h3>
      <button onClick={onBackToProjects} type="button" id="back-to-projects-from-assets-button">
        &larr; Back to Projects
      </button>

      <h4>Upload New Asset</h4>
      <form id="upload-asset-form" onSubmit={handleUploadAsset}>
        <input type="file" id="asset-file-input" name="assetFile" onChange={handleFileChange} required />
        <button type="submit">Upload Asset</button>
      </form>
      {uploadStatus && <div id="upload-status-message" style={{ marginTop: '10px' }}>{uploadStatus}</div>}

      <h4>Uploaded Assets</h4>
      {isLoadingAssets && <p>Loading assets...</p>}
      {assetError && <p className="error-message">{assetError}</p>}
      {!isLoadingAssets && !assetError && (
        <div id="asset-list-container">
          {assets.length === 0 ? (
            <p>No assets uploaded yet.</p>
          ) : (
            <ul className="asset-list">
              {assets.map(asset => (
                <li key={asset.assetId || asset.id} className="asset-item">
                  <strong>{asset.name}</strong>
                  <p>Type: {asset.type}</p>
                  {asset.googleDriveFileId && <p><small>Drive ID: {asset.googleDriveFileId}</small></p>}
                  <p><small>Asset ID: {asset.assetId || asset.id}</small></p>
                  <button onClick={() => handleDeleteAsset(asset.assetId || asset.id)} className="delete-asset-btn">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AssetsSection;
