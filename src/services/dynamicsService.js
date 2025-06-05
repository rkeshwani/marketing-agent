const CrmService = require('./crmService');

class DynamicsService extends CrmService {
  createContact(contactData) {
    console.log('DynamicsService.createContact called', contactData);
    return null;
  }

  getContact(contactId) {
    console.log('DynamicsService.getContact called', contactId);
    return null;
  }

  updateContact(contactId, contactData) {
    console.log('DynamicsService.updateContact called', contactId, contactData);
    return null;
  }

  deleteContact(contactId) {
    console.log('DynamicsService.deleteContact called', contactId);
    return null;
  }

  createList(listData) {
    console.log('DynamicsService.createList called', listData);
    return null;
  }

  getList(listId) {
    console.log('DynamicsService.getList called', listId);
    return null;
  }

  updateList(listId, listData) {
    console.log('DynamicsService.updateList called', listId, listData);
    return null;
  }

  deleteList(listId) {
    console.log('DynamicsService.deleteList called', listId);
    return null;
  }

  addContactToList(contactId, listId) {
    console.log('DynamicsService.addContactToList called', contactId, listId);
    return null;
  }

  removeContactFromList(contactId, listId) {
    console.log('DynamicsService.removeContactFromList called', contactId, listId);
    return null;
  }

  createCampaign(campaignData) {
    console.log('DynamicsService.createCampaign called', campaignData);
    return null;
  }

  getCampaign(campaignId) {
    console.log('DynamicsService.getCampaign called', campaignId);
    return null;
  }

  updateCampaign(campaignId, campaignData) {
    console.log('DynamicsService.updateCampaign called', campaignId, campaignData);
    return null;
  }

  deleteCampaign(campaignId) {
    console.log('DynamicsService.deleteCampaign called', campaignId);
    return null;
  }
}

module.exports = DynamicsService;
