const CrmService = require('../../src/services/crmService');

describe('CrmService Abstract Class', () => {
  let service;

  beforeEach(() => {
    service = new CrmService();
  });

  test('createContact should throw "Method not implemented" error', () => {
    expect(() => service.createContact({})).toThrow("Method 'createContact()' must be implemented.");
  });

  test('getContact should throw "Method not implemented" error', () => {
    expect(() => service.getContact('id')).toThrow("Method 'getContact()' must be implemented.");
  });

  test('updateContact should throw "Method not implemented" error', () => {
    expect(() => service.updateContact('id', {})).toThrow("Method 'updateContact()' must be implemented.");
  });

  test('deleteContact should throw "Method not implemented" error', () => {
    expect(() => service.deleteContact('id')).toThrow("Method 'deleteContact()' must be implemented.");
  });

  test('createList should throw "Method not implemented" error', () => {
    expect(() => service.createList({})).toThrow("Method 'createList()' must be implemented.");
  });

  test('getList should throw "Method not implemented" error', () => {
    expect(() => service.getList('id')).toThrow("Method 'getList()' must be implemented.");
  });

  test('updateList should throw "Method not implemented" error', () => {
    expect(() => service.updateList('id', {})).toThrow("Method 'updateList()' must be implemented.");
  });

  test('deleteList should throw "Method not implemented" error', () => {
    expect(() => service.deleteList('id')).toThrow("Method 'deleteList()' must be implemented.");
  });

  test('addContactToList should throw "Method not implemented" error', () => {
    expect(() => service.addContactToList('contactId', 'listId')).toThrow("Method 'addContactToList()' must be implemented.");
  });

  test('removeContactFromList should throw "Method not implemented" error', () => {
    expect(() => service.removeContactFromList('contactId', 'listId')).toThrow("Method 'removeContactFromList()' must be implemented.");
  });

  test('createCampaign should throw "Method not implemented" error', () => {
    expect(() => service.createCampaign({})).toThrow("Method 'createCampaign()' must be implemented.");
  });

  test('getCampaign should throw "Method not implemented" error', () => {
    expect(() => service.getCampaign('id')).toThrow("Method 'getCampaign()' must be implemented.");
  });

  test('updateCampaign should throw "Method not implemented" error', () => {
    expect(() => service.updateCampaign('id', {})).toThrow("Method 'updateCampaign()' must be implemented.");
  });

  test('deleteCampaign should throw "Method not implemented" error', () => {
    expect(() => service.deleteCampaign('id')).toThrow("Method 'deleteCampaign()' must be implemented.");
  });
});
