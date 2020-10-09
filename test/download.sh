#!/bin/bash

NBERRORS=0

cd software

function checkFile() {
    FILE="$1"
    SHA="$2"
    if [ -f "$FILE" ] && ../checksum.js "$FILE" "$SHA"; then
        touch ".$FILE"
        return 0;
    else
        rm -f ".$FILE"
        return 1;
    fi
}

function downloadFile() {
    local FILE="$1"
    local URL="$2"
    local SHA="$3"
    if [ -f ".$FILE" -a -f "$FILE" ] || checkFile "$FILE" "$SHA" ; then
        echo "OK: $FILE"
    else
        curl -L -C - -o "$FILE" "$URL"
        if checkFile "$FILE" "$SHA" ; then
            echo "OK: $FILE"
        else
            NBERRORS=$((NBERRORS+1))
            rm -f "$FILE"
            echo "KO: $FILE"
        fi
    fi
}

downloadFile alpine.iso http://dl-cdn.alpinelinux.org/alpine/v3.12/releases/x86_64/alpine-standard-3.12.0-x86_64.iso 02d58cdafc471200489a02c4162e9211fc9c38a200f064e5585e3b7945ec41257c79286a5fe282129159bcacd787f909de74471eac35193b3a4377162d09fa29

if [ "$NBERRORS" != "0" ]; then
    echo "There were $NBERRORS error(s) while downloading required files."
    exit 1
fi
