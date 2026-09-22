import os
import hashlib
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from backend.config import ENCRYPTION_KEY

IV_LENGTH = 16
TAG_LENGTH = 16


def get_encryption_key() -> bytes:
    """
    Derives a 32-byte encryption key using SHA-256 from the secret string
    """
    secret = ENCRYPTION_KEY or "deploynest_default_32_byte_secret_key!"
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt(text: str) -> str:
    """
    Encrypts a plaintext string into a hex string containing IV, Auth Tag, and Ciphertext
    Format: ivHex:authTagHex:ciphertextHex
    """
    if not text:
        return ""
    try:
        iv = os.urandom(IV_LENGTH)
        key = get_encryption_key()
        cipher = Cipher(algorithms.AES(key), modes.GCM(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(text.encode("utf-8")) + encryptor.finalize()
        auth_tag = encryptor.tag

        return f"{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"
    except Exception as err:
        print(f"Encryption failed: {err}")
        return ""


def decrypt(encrypted_text: str) -> str:
    """
    Decrypts a formatted hex string back to plaintext
    Format: ivHex:authTagHex:ciphertextHex
    """
    if not encrypted_text:
        return ""
    try:
        parts = encrypted_text.split(":")
        if len(parts) != 3:
            return encrypted_text

        iv = bytes.fromhex(parts[0])
        auth_tag = bytes.fromhex(parts[1])
        ciphertext = bytes.fromhex(parts[2])

        key = get_encryption_key()
        cipher = Cipher(algorithms.AES(key), modes.GCM(iv, auth_tag), backend=default_backend())
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(ciphertext) + decryptor.finalize()

        return decrypted.decode("utf-8")
    except Exception as err:
        # Fallback if decryption fails or if text is plain
        return ""


def mask_token(token: str) -> str:
    """
    Masks sensitive tokens for dashboard display (e.g. ghp_123456... -> ghp_••••••••••••5678)
    """
    if not token:
        return ""
    if len(token) <= 8:
        return "********"
    return f"{token[:4]}••••••••••••{token[-4:]}"
