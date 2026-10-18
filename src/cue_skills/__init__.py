import os
import shutil
import sys

__version__ = "0.1.0"


def main():
    npx = shutil.which("npx")  # also finds npx.cmd on Windows
    if npx:
        os.execv(npx, [npx, "-y", f"cue-skills@{__version__}", *sys.argv[1:]])
    print("cue-skills needs Node 18+: https://nodejs.org")
    sys.exit(1)
