const HubspotService = require('../../src/services/hubspotService');

describe('HubspotService', () => {
  let service;

  beforeEach(() => {
    service = new HubspotService();
    // console.log = jest.fn(); // Optional: Mock console.log
  });

  test('createContact should return null', () => {
    expect(service.createContact({})).toBeNull();
  });

  test('getContact should return null', () => {
    expect(service.getContact('id')).toBeNull();
  });

  test('updateContact should return null', () => {
    expect(service.updateContact('id', {})).toBeNull();
  });

  test('deleteContact should return null', () => {
    expect(service.deleteContact('id')).toBeNull();
  });

  test('createList should return null', () => {
    expect(service.createList({})).toBeNull();
  });

  test('getList should return null', () => {
    expect(service.getList('id')).toBeNull();
  });

  test('updateList should return null', () => {
    expect(service.updateList('id', {})).toBeNull();
  });

  test('deleteList should return null', () => {
    expect(service.deleteList('id')).toBeNull();
  });

  test('addContactToList should return null', () => {
    expect(service.addContactToList('contactId', 'listId')).toBeNull();
  });

  test('removeContactFromList should return null', () => {
    expect(service.removeContactFromList('contactId', 'listId')).toBeNull();
  });

  test('createCampaign should return null', () => {
    expect(service.createCampaign({})).toBeNull();
  });

  test('getCampaign should return null', () => {
    expect(service.getCampaign('id')).toBeNull();
  });

  test('updateCampaign should return null', () => {
    expect(service.updateCampaign('id', {})).toBeNull();
  });

  test('deleteCampaign should return null', () => {
    expect(service.deleteCampaign('id')).toBeNull();
  });
});
