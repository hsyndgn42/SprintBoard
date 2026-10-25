package com.sprintboard;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Slack bot/app tokens. Encryption itself lives in SecretVault so every integration shares it. */
@Component
public class SlackSecretVault {
 private final SecretVault vault;
 public SlackSecretVault(@Value("${sprintboard.slack.encryption-key:}") String configured,@Value("${sprintboard.slack.key-file:./service/data/slack-token.key}") String file){this.vault=new SecretVault(configured,file,"Slack","tokenları");}
 public String encrypt(String value){return vault.encrypt(value);}
 public String decrypt(String value){return vault.decrypt(value);}
}
