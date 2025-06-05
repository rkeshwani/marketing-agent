const CrmService = require('./crmService');

class SalesforceService extends CrmService {
  createContact(contactData) {
    console.log('SalesforceService.createContact called', contactData);
    return null;
  }

  getContact(contactId) {
    console.log('SalesforceService.getContact called', contactId);
    return null;
  }

  updateContact(contactId, contactData) {
    console.log('SalesforceService.updateContact called', contactId, contactData);
    return null;
  }

  deleteContact(contactId) {
    console.log('SalesforceService.deleteContact called', contactId);
    return null;
  }

  createList(listData) {
    console.log('SalesforceService.createList called', listData);
    return null;
  }

  getList(listId) {
    console.log('SalesforceService.getList called', listId);
    return null;
  }

  updateList(listId, listData) {
    console.log('SalesforceService.updateList called', listId, listData);
    return null;
  }

  deleteList(listId) {
    console.log('SalesforceService.deleteList called', listId);
    return null;
  }

  addContactToList(contactId, listId) {
    console.log('SalesforceService.addContactToList called', contactId, listId);
    return null;
  }

  removeContactFromList(contactId, listId) {
    console.log('SalesforceService.removeContactFromList called', contactId, listId);
    return null;
  }

  createCampaign(campaignData) {
    console.log('SalesforceService.createCampaign called', campaignData);
    return null;
  }

  getCampaign(campaignId) {
    console.log('SalesforceService.getCampaign called', campaignId);
    return null;
  }

  updateCampaign(campaignId, campaignData) {
    console.log('SalesforceService.updateCampaign called', campaignId, campaignData);
    return null;
  }

  deleteCampaign(campaignId) {
    console.log('SalesforceService.deleteCampaign called', campaignId);
    return null;
  }
}

module.exports = SalesforceService;
