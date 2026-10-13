export const short = {
  en_US:
    'Collect syslog from your network devices into plain text files, one per device per day',
  es_ES:
    'Recoge el syslog de los dispositivos de tu red en archivos de texto plano, uno por dispositivo y día',
  de_DE:
    'Sammelt Syslog-Meldungen Ihrer Netzwerkgeräte in reinen Textdateien, eine pro Gerät und Tag',
  pl_PL:
    'Zbiera syslog z urządzeń w sieci do zwykłych plików tekstowych, jeden na urządzenie na dzień',
  fr_FR:
    'Collecte le syslog de vos appareils réseau dans des fichiers texte bruts, un par appareil et par jour',
}

export const long = {
  en_US:
    'Log Collector is a syslog receiver built on rsyslog. Point your firewall, router, NAS, servers and other devices at it, and it writes everything they send into plain text files: one folder per device, one file per day. Plain text is easy to search, archive, or hand to a script or an AI agent. It accepts syslog over UDP and TCP on a port you choose (5514 by default, since StartOS reserves ports below 1025), names the folders by hostname or IP address, and deletes files older than the retention period you set.',
  es_ES:
    'Log Collector es un receptor de syslog basado en rsyslog. Apunta tu cortafuegos, router, NAS, servidores y otros dispositivos hacia él, y escribe todo lo que envían en archivos de texto plano: una carpeta por dispositivo y un archivo por día. El texto plano es fácil de buscar, archivar o pasar a un script o a un agente de IA. Acepta syslog por UDP y TCP en el puerto que elijas (5514 por defecto, ya que StartOS reserva los puertos por debajo de 1025), nombra las carpetas por nombre de host o dirección IP y elimina los archivos más antiguos que el periodo de retención que configures.',
  de_DE:
    'Log Collector ist ein Syslog-Empfänger auf Basis von rsyslog. Richten Sie Ihre Firewall, Ihren Router, Ihr NAS, Ihre Server und andere Geräte darauf aus, und er schreibt alles, was sie senden, in reine Textdateien: ein Ordner pro Gerät, eine Datei pro Tag. Reiner Text lässt sich leicht durchsuchen, archivieren oder an ein Skript oder einen KI-Agenten übergeben. Er nimmt Syslog über UDP und TCP auf einem Port Ihrer Wahl an (standardmäßig 5514, da StartOS die Ports unter 1025 reserviert), benennt die Ordner nach Hostname oder IP-Adresse und löscht Dateien, die älter als die eingestellte Aufbewahrungsdauer sind.',
  pl_PL:
    'Log Collector to odbiornik syslog oparty na rsyslog. Skieruj na niego zaporę, router, NAS, serwery i inne urządzenia, a wszystko, co wysyłają, zapisze w zwykłych plikach tekstowych: jeden folder na urządzenie, jeden plik na dzień. Zwykły tekst łatwo przeszukiwać, archiwizować lub przekazać skryptowi albo agentowi AI. Przyjmuje syslog przez UDP i TCP na wybranym porcie (domyślnie 5514, ponieważ StartOS rezerwuje porty poniżej 1025), nazywa foldery według nazwy hosta lub adresu IP i usuwa pliki starsze niż ustawiony okres przechowywania.',
  fr_FR:
    "Log Collector est un récepteur syslog basé sur rsyslog. Dirigez votre pare-feu, votre routeur, votre NAS, vos serveurs et vos autres appareils vers lui, et il écrit tout ce qu'ils envoient dans des fichiers texte bruts : un dossier par appareil, un fichier par jour. Le texte brut est facile à rechercher, à archiver ou à confier à un script ou à un agent IA. Il accepte le syslog en UDP et en TCP sur le port de votre choix (5514 par défaut, car StartOS réserve les ports inférieurs à 1025), nomme les dossiers par nom d'hôte ou par adresse IP, et supprime les fichiers plus anciens que la durée de conservation choisie.",
}
