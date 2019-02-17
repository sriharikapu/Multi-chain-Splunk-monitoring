import subprocess
import sys

subprocess.call(["/usr/bin/python3",
                 "/opt/splunk/etc/apps/chainmon/bin/abi_decoder.py"] + sys.argv[1:])
