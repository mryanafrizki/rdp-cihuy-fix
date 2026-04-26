#!/bin/bash

# Pastikan dua parameter diberikan
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <password> <img_version | direct .gz URL>"
  echo "Available img_version:"
  echo " win_10ghost, win_22, win_19, win_12"
  echo " win_2008, win_2012R2, win_2016, win_2019, win_7, win_10_ent, win_11_pro, win_2025"
  echo " win_2022_lite, win_2016_lite, win_2012R2_lite, win_7_sp1_lite"
  echo " win_2012R2_uefi, win_2016_uefi, win_2019_uefi, win_2022_uefi, win_10_uefi, win_11_uefi, win_2025_uefi, win_10_atlas"
  echo "Or provide a direct image URL (must contain .gz)"
  exit 1
fi

PASSWORD=$1
IMG_VERSION=$2

# Cek apakah IMG_VERSION adalah URL langsung yang mengandung .gz
if [[ "$IMG_VERSION" =~ ^https?://.*\.gz.*$ ]]; then
  IMG_URL="$IMG_VERSION"
else
  # Mapping img_version ke URL
  case $IMG_VERSION in
    win_10ghost)
      IMG_URL="http://metrohosting.my.id/images/win10ghost.gz"
      ;;
    win_22)
      IMG_URL="http://metrohosting.my.id/images/windows2022.gz"
      ;;
    win_19)
      IMG_URL="http://metrohosting.my.id/images/win2019.gz"
      ;;
    # Standard Versions
    win_2008)
      IMG_URL="https://files.meocloud.my.id/9:/windows2008.gz"
      ;;
    win_2012R2)
      IMG_URL="https://files.meocloud.my.id/4:/windows2012R2.gz"
      ;;
    win_2016)
      IMG_URL="https://files.meocloud.my.id/4:/windows2016.gz"
      ;;
    win_2019)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/windows2019.gz"
      ;;
    win_7)
      IMG_URL="https://files.meocloud.my.id/9:/windows7.gz"
      ;;
    win_10_ent)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/windows10.gz"
      ;;
    win_11_pro)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/windows11.gz"
      ;;
    # Lite Versions
    win_2022_lite)
      IMG_URL="https://files.meocloud.my.id/6:/winsrv2022lite.gz"
      ;;
    win_2016_lite)
      IMG_URL="https://files.meocloud.my.id/6:/winsrv2016lite.gz"
      ;;
    win_2012R2_lite)
      IMG_URL="https://files.meocloud.my.id/6:/winsrv2012r2lite.gz"
      ;;
    win_7_sp1_lite)
      IMG_URL="https://files.meocloud.my.id/6:/win7lite.gz"
      ;;
    # UEFI Versions
    win_2012R2_uefi)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/Windows2012R2_UEFI.gz"
      ;;
    win_2016_uefi)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/Windows2016_UEFI.gz"
      ;;
    win_2019_uefi)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/Windows2019_UEFI.gz"
      ;;
    win_2022_uefi)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/Windows2022_UEFI.gz"
      ;;
    win_2025)
      IMG_URL="https://files.meocloud.my.id/10:/windows2025.gz"
      ;;
    win_10_uefi)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/Windows10_UEFI.gz"
      ;;
    win_11_uefi)
      IMG_URL="https://files.meocloud.my.id/7:/UEFI/Windows11_UEFI.gz"
      ;;
    win_2025_uefi)
      IMG_URL="https://files.meocloud.my.id/10:/windows2025_uefi.gz"
      ;;
    win_10_atlas)
      IMG_URL="https://mizuai.my.id/Win-10.gz"
      ;;
    *)
      echo "Invalid img_version or unsupported URL format."
      echo "Use one of: win_10, win_22, win_19, win_12, win_2008, win_2012R2, win_2016,"
      echo "win_2019, win_7, win_10_ent, win_11_pro, win_2025, win_2022_lite, win_2016_lite,"
      echo "win_2012R2_lite, win_7_sp1_lite, win_2012R2_uefi, win_2016_uefi, win_2019_uefi,"
      echo "win_2022_uefi, win_10_uefi, win_11_uefi, win_2025_uefi, win_10_atlas"
      echo "Or provide a direct .gz URL"
      exit 1
      ;;
  esac
fi

echo "Starting Dedicated RDP installation..."
echo "OS: $IMG_VERSION"
echo "Image URL: $IMG_URL"

echo "Downloading reinstall.sh..."
curl -O https://raw.githubusercontent.com/kripul/reinstall/main/reinstall.sh || \
wget -O reinstall.sh https://raw.githubusercontent.com/kripul/reinstall/main/reinstall.sh

if [ ! -f "reinstall.sh" ]; then
  echo "Failed to download reinstall.sh"
  exit 1
fi

chmod +x reinstall.sh

echo "Running reinstall.sh with parameters..."
bash reinstall.sh dd \
  --rdp-port 8765 \
  --password "$PASSWORD" \
  --img "$IMG_URL"

if [ $? -eq 0 ]; then
  echo "Installation completed successfully!"
  echo "RDP will be available on port 8765"
  echo "Username: administrator"
  echo "Password: $PASSWORD"
  echo "Rebooting system in 5 seconds..."
  sleep 5
  reboot
else
  echo "Installation failed!"
  exit 1
fi
