class CrmService {
  createContact(contactData) {
    throw new Error("Method 'createContact()' must be implemented.");
  }

  getContact(contactId) {
    throw new Error("Method 'getContact()' must be implemented.");
  }

  updateContact(contactId, contactData) {
    throw new Error("Method 'updateContact()' must be implemented.");
  }

  deleteContact(contactId) {
    throw new Error("Method 'deleteContact()' must be implemented.");
  }

  createList(listData) {
    throw new Error("Method 'createList()' must be implemented.");
  }

  getList(listId) {
    throw new Error("Method 'getList()' must be implemented.");
  }

  updateList(listId, listData) {
    throw new Error("Method 'updateList()' must be implemented.");
  }

  deleteList(listId) {
    throw new Error("Method 'deleteList()' must be implemented.");
  }

  addContactToList(contactId, listId) {
    throw new Error("Method 'addContactToList()' must be implemented.");
  }

  removeContactFromList(contactId, listId) {
    throw new Error("Method 'removeContactFromList()' must be implemented.");
  }

  createCampaign(campaignData) {
    throw new Error("Method 'createCampaign()' must be implemented.");
  }

  getCampaign(campaignId) {
    throw new Error("Method 'getCampaign()' must be implemented.");
  }

  updateCampaign(campaignId, campaignData) {
    throw new Error("Method 'updateCampaign()' must be implemented.");
  }

  deleteCampaign(campaignId) {
    throw new Error("Method 'deleteCampaign()' must be implemented.");
  }
}

module.exports = CrmService;
