from web3 import Web3
import json
import os
import logging
import sys
import csv
import argparse

ADDRESS_CSV = '/opt/splunk/var/run/splunk/csv/addresses.csv'
LOOKUP_CSV = '/opt/splunk/etc/apps/search/lookups/eth_contract_lookup.csv'
PROVIDER = "https://mainnet.infura.io/v3/2dde44156cac4665a116430b56ba8f98"

class ABIDecoder(object):

    def __init__(self):
        parser = argparse.ArgumentParser(
            description='Web3 Lookup Utilites for Splunk',
            usage='''abiDecode <command> [<args>]

The most commonly used commands are:
   call            Calls a function on an address.
   compatible      Makes a guess if an address is compatible with an ABI
''')
        parser.add_argument('command', help='Subcommand to run')
        # parse_args defaults to [1:] for args, but you need to
        # exclude the rest of the args too, or validation will fail
        args = parser.parse_args(sys.argv[1:2])
        if not hasattr(self, args.command):
            print('Unrecognized command')
            parser.print_help()
            exit(1)

        self._load_abis()
        self.w3 = Web3(Web3.HTTPProvider(PROVIDER))
        if self.w3.isConnected():
            logging.info("Web3 connected to: {} on network {}".format(self.w3.version.node, self.w3.version.network))
        else:
            logging.error("Web3 not connected.")
            sys.exit(1)

        # use dispatch pattern to invoke method with same name
        getattr(self, args.command)()

    def call(self):
        parser = argparse.ArgumentParser(
            description='Calls a function at an address',
            usage='''abiDecode call <address> <abi> <function> [<args>]

Arguments:
   address         An ethereum address or ENS address
   abi             ABI interface
   function        Function to call
   args            Space delimited list of args to pass to function
''')
        # prefixing the argument with -- means it's optional
        parser.add_argument('address')
        parser.add_argument('abi')
        parser.add_argument('function')
        parser.add_argument('arguments', nargs='*')
        # now that we're inside a subcommand, ignore the first
        # TWO argvs, ie the command (git) and the subcommand (commit)
        args = parser.parse_args(sys.argv[2:])
        print(self.call_func(args.abi, args.address, args.function, args.arguments))

    def compatible(self):
        parser = argparse.ArgumentParser(
            description='Calls a function at an address',
            usage='''abiDecode compatible <address> [--abi <abi>]

Arguments:
   addresses         A csv of ethereum addresses or ENS names
   --output          A csv of output files
   --abi             A particular ABI to test (will not write to lookup)
   --overwrite       Delete and overwrite all the files in the lookup
''')
        # NOT prefixing the argument with -- means it's not optional
        parser.add_argument('--addresses', default=ADDRESS_CSV)
        parser.add_argument('--abi')
        parser.add_argument('--output', default=LOOKUP_CSV)
        parser.add_argument('--overwrite', action='store_true')
        args = parser.parse_args(sys.argv[2:])
        self._load_addresses(args.output)

        with open(args.addresses, 'r') as csvfile:
            lookup = csv.reader(csvfile)
            next(lookup) # Skip the header
            addresses = set([ r[0] for r in lookup ])

        output = {}
        for address in addresses:
            if self._should_test(address):
                output[address] = {}
            else:
                continue

            if args.abi:
                output[address][abi] = self.is_compatible(args.abi, address)
            else:
                for abi in self.abis.keys():
                    output[address][abi] = self.is_compatible(abi, address)
            self.testedKeys.add(address)
       
        if args.abi:
            print(output)
        else:
            self._write_lookup(args.output, output, overwrite=args.overwrite)

    ### Private functions ###
    def _load_abis(self, folder='./abi'):
        self.abis = {}
        for (dirpath, dirnames, filenames) in os.walk(folder):
            for file in filenames:
                with open(os.path.join(dirpath, file)) as f:
                    self.abis[file.split('.')[0]] = json.load(f)

    def _load_addresses(self, file):
        if not os.path.isfile(file):
            self.testedKeys = set()
            return

        with open(file, 'r') as csvfile:
            lookup = csv.reader(csvfile)
            next(lookup) # Skip the header
            self.testedKeys = set([ r[0] for r in lookup ])


    def call_func(self, abi, address, function, args):
        """ Given an abi and an address, can call an arbitrary function 
        with args. Address can be an ENS address as well."""
        abstractContract = self.w3.eth.contract(abi=self.abis[abi])
        contract = abstractContract(address=address)
        func = contract.get_function_by_name(function)
        return func(*args).call()

    def _should_test(self, address):
        bytecode = self.w3.eth.getCode(address)
        if len(bytecode) == 0:
            # No code at address so just bounce.
            logging.info("No code at address: {}".format(address))
            self.testedKeys.add
            return False

        if address in self.testedKeys:
            logging.info("Not retesting address: {}".format(address))
            return False

        return True

    def is_compatible(self, abi, address):
        """ Make a determination of whether or not an address is compatible
        with an address."""
        bytecode = self.w3.eth.getCode(address)
        if len(bytecode) == 0:
            # No code at address so just bounce.
            logging.info("No code at address: {}".format(address))
            return False

        contract = self.w3.eth.contract(abi=self.abis[abi], address=address)
        for func in contract.all_functions():
            inputs = func.abi['inputs']
            try:
                # TODO: expand this to work with more arbitrary function arguments
                # TODO: is it possible to validate this with just the bytecode?
                if inputs == []:
                    arguments = []
                    func(*arguments).call()
            except Exception as e:
                logging.info("Address: {} failed compatibilty with abi {} on function {}".format(address, abi, func))
                return False

        return True

    def _write_lookup(self, file, data, overwrite=False):
        file_exists = os.path.isfile(file)
        ops = 'w' if overwrite else 'a'

        if len(data) == 0:
            logging.info("No data to write, exiting.")
            return

        with open(file, ops, newline='') as csvfile:
            fieldnames = [ 'address' ] + list(data[next(iter(data))].keys())
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            if not file_exists or ops == 'w':
                writer.writeheader()

            for key, value in data.items():
                row = data[key]
                row['address'] = key
                writer.writerow(row)

def main():
    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
    ABIDecoder()

if __name__ == '__main__':
    main()
