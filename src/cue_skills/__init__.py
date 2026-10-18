import os
import shutil
import sys

__version__ = "0.1.0"


def main():
    if shutil.which("node"):
        os.execvp("npx", ["npx", "-y", f"cue-skills@{__version__}", *sys.argv[1:]])
    print("cue-skills needs Node 18+: https://nodejs.org")
    sys.exit(1)
