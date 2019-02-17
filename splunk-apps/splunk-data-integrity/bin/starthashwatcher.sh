#!/bin/bash  
cd $SPLUNK_HOME/etc/apps/splunk-data-integrity/bin
trap 'kill $(jobs -p)' EXIT
$SPLUNK_HOME/bin/splunk cmd node hashwatcher.js
echo "`date -u` INFO Hashwatcher event=exited"
