import splunk.admin as admin
import splunk.entity as en
# import your required python modules

'''
Copyright (C) 2005 - 2018 Splunk Inc. All Rights Reserved.
Description:  This skeleton python script handles the parameters in the configuration page.

      handleList method: lists configurable parameters in the configuration page
      corresponds to handleractions = list in restmap.conf

      handleEdit method: controls the parameters and saves the values 
      corresponds to handleractions = edit in restmap.conf

'''

class ConfigApp(admin.MConfigHandler):
  '''
  Set up supported arguments
  '''
  def setup(self):
    if self.requestedAction == admin.ACTION_EDIT:
      for arg in ['wallet', 'privatekey', 'url', 'apikey', 'contract']:
        self.supportedArgs.addOptArg(arg)
        

  def handleList(self, confInfo):
    confDict = self.readConf("dataintegritysetup")
    if None != confDict:
      for stanza, settings in confDict.items():
        for key, val in settings.items():
          if key in ['wallet'] and val in [None, '']:
            val = ''
          if key in ['privatekey'] and val in [None, '']:
            val = ''
          if key in ['url'] and val in [None, '']:
            val = ''
          if key in ['apikey'] and val in [None, '']:
            val = ''
          if key in ['contract'] and val in [None, '']:
            val = ''
          confInfo[stanza].append(key, val)
          

  def handleEdit(self, confInfo):
    name = self.callerArgs.id
    args = self.callerArgs
    
    if self.callerArgs.data['wallet'][0] in [None, '']:
      self.callerArgs.data['wallet'][0] = ''
    if self.callerArgs.data['privatekey'][0] in [None, '']:
      self.callerArgs.data['privatekey'][0] = ''
    if self.callerArgs.data['url'][0] in [None, '']:
      self.callerArgs.data['url'][0] = ''
    if self.callerArgs.data['apikey'][0] in [None, '']:
      self.callerArgs.data['apikey'][0] = ''
    if self.callerArgs.data['contract'][0] in [None, '']:
      self.callerArgs.data['contract'][0] = ''
        
    self.writeConf('dataintegritysetup', 'dataintegrity', self.callerArgs.data)
      
# initialize the handler
admin.init(ConfigApp, admin.CONTEXT_NONE)