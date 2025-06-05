const CrmService = require('./crmService');

class HubspotService extends CrmService {
  createContact(contactData) {
    console.log('HubspotService.createContact called', contactData);
    return null;
  }

  getContact(contactId) {
    console.log('HubspotService.getContact called', contactId);
    return null;
  }

  updateContact(contactId, contactData) {
    console.log('HubspotService.updateContact called', contactId, contactData);
    return null;
  }

  deleteContact(contactId) {
    console.log('HubspotService.deleteContact called', contactId);
    return null;
  }

  createList(listData) {
    console.log('HubspotService.createList called', listData);
    return null;
  }

  getList(listId) {
    console.log('HubspotService.getList called', listId);
    return null;
  }

  updateList(listId, listData) {
    console.log('HubspotService.updateList called', listId, listData);
    return null;
  }

  deleteList(listId) {
    console.log('HubspotService.deleteList called', listId);
    return null;
  }

  addContactToList(contactId, listId) {
    console.log('HubspotService.addContactToList called', contactId, listId);
    return null;
  }

  removeContactFromList(contactId, listId) {
    console.log('HubspotService.removeContactFromList called', contactId, listId);
    return null;
  }

  createCampaign(campaignData) {
    console.log('HubspotService.createCampaign called', campaignData);
    return null;
  }

  getCampaign(campaignId) {
    console.log('HubspotService.getCampaign called', campaignId);
    return null;
  }

  updateCampaign(campaignId, campaignData) {
    console.log('HubspotService.updateCampaign called', campaignId, campaignData);
    return null;
  }

  deleteCampaign(campaignId) {
    console.log('HubspotService.deleteCampaign called', campaignId);
    return null;
  }
}

module.exports = HubspotService;
